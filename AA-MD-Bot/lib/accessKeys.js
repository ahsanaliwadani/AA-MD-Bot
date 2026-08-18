import crypto from 'crypto';
import { db, saveNow } from './database.js';

const KEY_STATUSES = new Set(['pending', 'active', 'revoked', 'expired', 'disabled']);
const KEY_LENGTH = 32;
export const ACCESS_KEY_SUPPORT_NUMBER = '+923316041183';

function intSetting(name, fallback) {
  const value = db.settings.getValue(name) ?? process.env[name];
  const parsed = parseInt(value ?? fallback, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAccessKeySecuritySettings() {
  return {
    accessKeysEnforced: isAccessEnforced(),
    ACCESS_KEY_VERIFY_LIMIT: intSetting('ACCESS_KEY_VERIFY_LIMIT', 5),
    ACCESS_KEY_VERIFY_WINDOW_MS: intSetting('ACCESS_KEY_VERIFY_WINDOW_MS', 15 * 60 * 1000),
    ACCESS_KEY_HASH_ITERATIONS: intSetting('ACCESS_KEY_HASH_ITERATIONS', 210000),
    ACCESS_KEY_PEPPER_SET: !!(db.settings.getValue('ACCESS_KEY_PEPPER') || process.env.ACCESS_KEY_PEPPER || process.env.SESSION_SECRET),
  };
}

function fingerprintSecret() {
  return db.settings.getValue('ACCESS_KEY_PEPPER') || process.env.ACCESS_KEY_PEPPER || process.env.SESSION_SECRET || 'aa-md-bot-access-key-fingerprint';
}

const attemptCache = new Map();

export function isAccessEnforced() {
  return String(db.settings.getValue('ACCESS_KEYS_ENFORCED') ?? db.settings.getValue('accessKeysEnforced') ?? process.env.ACCESS_KEYS_ENFORCED ?? 'false').toLowerCase() === 'true';
}

export function normalizePhone(value = '') {
  let num = String(value).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (num.startsWith('00')) num = num.slice(2);
  return num;
}

export function jidToPhone(jid = '') {
  return normalizePhone(jid);
}

function now() { return Date.now(); }

function publicRecord(record) {
  if (!record) return null;
  const { keyHash, keySalt, keyFingerprint, ...safe } = record;
  return safe;
}

function randomKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars = Array.from(crypto.randomBytes(12), b => alphabet[b % alphabet.length]);
  return `AA-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

function normalizeKey(plainKey = '') {
  return String(plainKey).trim().toUpperCase().replace(/\s+/g, '');
}

function fingerprintKey(plainKey) {
  return crypto.createHmac('sha256', fingerprintSecret()).update(normalizeKey(plainKey)).digest('hex');
}

function hashKey(plainKey, salt = crypto.randomBytes(16).toString('hex'), iterations = intSetting('ACCESS_KEY_HASH_ITERATIONS', 210000)) {
  const hash = crypto.pbkdf2Sync(normalizeKey(plainKey), salt, iterations, KEY_LENGTH, 'sha256').toString('hex');
  return { salt, hash };
}

function verifyHash(plainKey, record) {
  if (!record?.keyHash || !record?.keySalt) return false;
  try {
    const { hash } = hashKey(plainKey, record.keySalt, record.hashIterations || intSetting('ACCESS_KEY_HASH_ITERATIONS', 210000));
    const expected = Buffer.from(record.keyHash, 'hex');
    const actual = Buffer.from(hash, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function markExpired(record) {
  if (record?.expiresAt && record.status !== 'expired' && now() > Number(record.expiresAt)) {
    db.accessKeys.set(record.id, { ...record, status: 'expired', expiredAt: now() });
    console.log('[ACCESS] Key expired', { id: record.id, phone: record.assignedPhone });
    return { ...record, status: 'expired', expiredAt: now() };
  }
  return record;
}

export async function generateAccessKey({ phone, expiresAt = null, createdBy = 'admin', connectionId = null } = {}) {
  const assignedPhone = normalizePhone(phone);
  if (!assignedPhone) throw new Error('Valid WhatsApp phone number is required');

  for (const record of Object.values(db.accessKeys.all())) {
    if (record.assignedPhone === assignedPhone && ['pending', 'active'].includes(record.status)) {
      db.accessKeys.set(record.id, { ...record, status: 'revoked', revokedAt: now(), revokedReason: 'replaced' });
    }
  }

  let plainKey = randomKey();
  while (Object.values(db.accessKeys.all()).some(record => record.keyFingerprint === fingerprintKey(plainKey))) {
    plainKey = randomKey();
  }
  const { salt, hash } = hashKey(plainKey);
  const id = crypto.randomUUID();
  const record = {
    id,
    keyHash: hash,
    keySalt: salt,
    keyFingerprint: fingerprintKey(plainKey),
    plainKey,
    hashIterations: intSetting('ACCESS_KEY_HASH_ITERATIONS', 210000),
    assignedPhone,
    status: 'active',
    createdAt: now(),
    activatedAt: null,
    lastUsedAt: null,
    expiresAt: expiresAt ? Number(expiresAt) : null,
    revokedAt: null,
    createdBy,
    connectionId,
  };
  db.accessKeys.set(id, record);
  await saveNow('accessKeys').catch(() => {});
  console.log('[ACCESS] Access Key generated', { id, phone: assignedPhone, createdBy });
  return { key: plainKey, record: publicRecord(record) };
}

function rateKey(phone, sessionId = '') { return `${normalizePhone(phone)}:${sessionId || 'default'}`; }

function checkRateLimit(phone, sessionId) {
  const key = rateKey(phone, sessionId);
  const entry = attemptCache.get(key) || { count: 0, first: now(), blockedUntil: 0 };
  if (entry.blockedUntil > now()) return { limited: true, retryAfterMs: entry.blockedUntil - now() };
  const windowMs = intSetting('ACCESS_KEY_VERIFY_WINDOW_MS', 15 * 60 * 1000);
  if (now() - entry.first > windowMs) {
    attemptCache.set(key, { count: 0, first: now(), blockedUntil: 0 });
    return { limited: false };
  }
  return { limited: false };
}

function recordFailure(phone, sessionId) {
  const key = rateKey(phone, sessionId);
  const entry = attemptCache.get(key) || { count: 0, first: now(), blockedUntil: 0 };
  const next = { ...entry, count: entry.count + 1 };
  if (next.count >= intSetting('ACCESS_KEY_VERIFY_LIMIT', 5)) next.blockedUntil = now() + intSetting('ACCESS_KEY_VERIFY_WINDOW_MS', 15 * 60 * 1000);
  attemptCache.set(key, next);
  return next.blockedUntil > now();
}

function clearFailures(phone, sessionId) { attemptCache.delete(rateKey(phone, sessionId)); }

export function getAuthorization(sessionId, phone) {
  const normalizedPhone = normalizePhone(phone);
  const auth = db.accessAuthorizations.get(`phone:${normalizedPhone}`) || db.accessAuthorizations.get(sessionId) || null;
  if (!auth || auth.phone !== normalizedPhone || !auth.accessKeyId) return null;
  const record = markExpired(db.accessKeys.get(auth.accessKeyId));
  if (!record || record.assignedPhone !== normalizedPhone || record.status !== 'active') return null;
  return { ...auth, key: publicRecord(record) };
}

export function isAuthorized(sessionId, phone) {
  if (!isAccessEnforced()) return true;
  if (String(db.sessionSettings.getValue(sessionId, 'legacyAccess') || '').toLowerCase() === 'true') return true;
  return !!getAuthorization(sessionId, phone);
}

export async function verifyAccessKey({ plainKey, phone, sessionId }) {
  const assignedPhone = normalizePhone(phone);
  if (!plainKey || !assignedPhone) return { ok: false, reason: 'invalid' };
  const limited = checkRateLimit(assignedPhone, sessionId);
  if (limited.limited) {
    console.log('[ACCESS] Too many attempts', { phone: assignedPhone, sessionId });
    return { ok: false, reason: 'rate_limited', retryAfterMs: limited.retryAfterMs };
  }

  let matched = null;
  const submittedFingerprint = fingerprintKey(plainKey);
  const records = Object.values(db.accessKeys.all());
  for (const record of records) {
    if (record.keyFingerprint === submittedFingerprint && verifyHash(plainKey, record)) { matched = markExpired(record); break; }
  }
  if (!matched) {
    for (const record of records) {
      if (record.keyFingerprint === submittedFingerprint) continue;
      if (verifyHash(plainKey, record)) { matched = markExpired(record); break; }
    }
  }

  if (!matched) {
    const blocked = recordFailure(assignedPhone, sessionId);
    console.log(blocked ? '[ACCESS] Too many attempts' : '[ACCESS] Invalid Access Key attempt', { phone: assignedPhone, sessionId });
    return { ok: false, reason: blocked ? 'rate_limited' : 'invalid' };
  }

  if (matched.assignedPhone !== assignedPhone) {
    recordFailure(assignedPhone, sessionId);
    console.log('[ACCESS] Access Key assigned-phone mismatch', { id: matched.id, phone: assignedPhone, sessionId });
    return { ok: false, reason: 'wrong_phone' };
  }

  if (matched.status !== 'active') {
    recordFailure(assignedPhone, sessionId);
    console.log('[ACCESS] Inactive Access Key attempt', { id: matched.id, phone: assignedPhone, status: matched.status });
    return { ok: false, reason: matched.status };
  }

  if (matched.expiresAt && now() > Number(matched.expiresAt)) {
    db.accessKeys.set(matched.id, { ...matched, status: 'expired', expiredAt: now() });
    recordFailure(assignedPhone, sessionId);
    console.log('[ACCESS] Key expired', { id: matched.id, phone: assignedPhone });
    return { ok: false, reason: 'expired' };
  }

  const activated = {
    ...matched,
    status: 'active',
    activatedAt: matched.activatedAt || now(),
    lastUsedAt: now(),
    connectionId: sessionId || matched.connectionId || null,
  };
  db.accessKeys.set(matched.id, activated);
  db.accessAuthorizations.set(`phone:${assignedPhone}`, {
    id: `phone:${assignedPhone}`,
    sessionId,
    lastSessionId: sessionId,
    phone: assignedPhone,
    accessKeyId: matched.id,
    authorizedAt: now(),
    lastVerifiedAt: now(),
  });
  await saveNow('accessKeys').catch(() => {});
  await saveNow('accessAuthorizations').catch(() => {});
  clearFailures(assignedPhone, sessionId);
  console.log('[ACCESS] Access Key verified', { id: matched.id, phone: assignedPhone, sessionId });
  return { ok: true, record: publicRecord(activated) };
}

export function listAccessKeys({ search = '' } = {}) {
  const q = normalizePhone(search) || String(search || '').toLowerCase();
  return Object.values(db.accessKeys.all())
    .map(markExpired)
    .filter(r => !q || r.assignedPhone.includes(q) || String(r.id).toLowerCase().includes(q))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(publicRecord);
}

export async function updateAccessKeyStatus(id, status) {
  if (!KEY_STATUSES.has(status)) throw new Error('Invalid status');
  const record = db.accessKeys.get(id);
  if (!record) throw new Error('Access key not found');
  const patch = { ...record, status };
  if (status === 'revoked') patch.revokedAt = now();
  if (['revoked', 'disabled', 'expired'].includes(status)) {
    for (const [authId, auth] of Object.entries(db.accessAuthorizations.all())) {
      if (auth.accessKeyId === id) db.accessAuthorizations.delete(authId);
    }
  }
  db.accessKeys.set(id, patch);
  await saveNow('accessKeys').catch(() => {});
  await saveNow('accessAuthorizations').catch(() => {});
  console.log(`[ACCESS] Key ${status}`, { id, phone: record.assignedPhone });
  return publicRecord(patch);
}

export async function deleteAccessKey(id) {
  const record = db.accessKeys.get(id);
  if (!record) throw new Error('Access key not found');
  db.accessKeys.delete(id);
  for (const [authId, auth] of Object.entries(db.accessAuthorizations.all())) {
    if (auth.accessKeyId === id) db.accessAuthorizations.delete(authId);
  }
  await saveNow('accessKeys').catch(() => {});
  await saveNow('accessAuthorizations').catch(() => {});
  console.log('[ACCESS] Key deleted', { id, phone: record.assignedPhone });
}

export const ACCESS_REQUIRED_MESSAGE =
  '🔐 *AA MD Bot Access Required*\n\n' +
  'Your WhatsApp number is connected, but an active Access Key is required to use AA MD Bot.\n\n' +
  `Please contact the AA MD Bot team on ${ACCESS_KEY_SUPPORT_NUMBER} to receive your Access Key.\n\n` +
  `If your Access Key has any issue, contact ${ACCESS_KEY_SUPPORT_NUMBER}.\n\n` +
  'After receiving your key, send:\n\n' +
  '*.key YOUR_ACCESS_KEY*\n\n' +
  'Example:\n*.key AA-XXXX-XXXX-XXXX*\n\n' +
  '> 💠 *AA MD Bot*  ⚡ *Smart • Fast • Powerful*';
