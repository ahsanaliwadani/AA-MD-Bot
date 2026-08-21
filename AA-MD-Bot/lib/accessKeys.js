import crypto from 'crypto';
import { db, deleteDocument, replaceDocument, saveNow } from './database.js';
import { getAccessKeySheetConfiguration, syncAccessKeyToSheet } from './accessKeySheet.js';

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
    accessKeySheet: getAccessKeySheetConfiguration(),
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

  // WhatsApp JIDs always use international format (for example 92300...)
  // while admins commonly enter local numbers (0300...). Store and compare a
  // single canonical value so a freshly generated key does not verify as
  // `wrong_phone` for the same real number. Pakistan is the project default;
  // deployments can override it with ACCESS_KEY_DEFAULT_COUNTRY_CODE.
  if (num.startsWith('0') && num.length > 1) {
    const countryCode = String(
      db.settings.getValue('ACCESS_KEY_DEFAULT_COUNTRY_CODE') ||
      process.env.ACCESS_KEY_DEFAULT_COUNTRY_CODE ||
      process.env.DEFAULT_COUNTRY_CODE ||
      '92'
    ).replace(/[^0-9]/g, '');
    if (countryCode) num = countryCode + num.replace(/^0+/, '');
  }

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

function historyEntry(action, actor = 'system', details = {}) {
  return { action, actor, at: now(), ...details };
}

function withHistory(record, action, actor, details = {}) {
  return { ...record, history: [...(Array.isArray(record.history) ? record.history : []), historyEntry(action, actor, details)] };
}

async function syncSheet(record, event) {
  try {
    await syncAccessKeyToSheet(record, event);
  } catch (error) {
    // A reporting failure must never prevent a valid customer key from being
    // generated, verified, or deleted in the authorization database.
    console.error('[ACCESS SHEET] Sync failed:', error.message);
  }
}

async function persistAccessKey(record) {
  if (!await replaceDocument('accessKeys', record.id, record)) {
    throw new Error('MongoDB is not configured; access key was not saved');
  }
}

export async function generateAccessKey({ phone, expiresAt = null, createdBy = 'admin', connectionId = null } = {}) {
  const assignedPhone = normalizePhone(phone);
  if (!assignedPhone) throw new Error('Valid WhatsApp phone number is required');

  for (const record of Object.values(db.accessKeys.all())) {
    if (normalizePhone(record.assignedPhone) === assignedPhone && ['pending', 'active'].includes(record.status)) {
      const revoked = withHistory({ ...record, status: 'revoked', revokedAt: now(), revokedReason: 'replaced' }, 'revoke', createdBy, { reason: 'replaced' });
      await persistAccessKey(revoked);
      db.accessKeys.set(record.id, revoked);
      await syncSheet(publicRecord(revoked), 'replaced');
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
    history: [historyEntry('generate', createdBy, { assignedPhone, expiresAt: expiresAt ? Number(expiresAt) : null, connectionId })],
  };
  await persistAccessKey(record);
  db.accessKeys.set(id, record);
  await saveNow('accessKeys').catch(() => {});
  await syncSheet(publicRecord(record), 'generated');
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
  if (!record || normalizePhone(record.assignedPhone) !== normalizedPhone || record.status !== 'active') return null;
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

  if (normalizePhone(matched.assignedPhone) !== assignedPhone) {
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
  await persistAccessKey(activated);
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
  await syncSheet(publicRecord(activated), 'verified');
  clearFailures(assignedPhone, sessionId);
  console.log('[ACCESS] Access Key verified', { id: matched.id, phone: assignedPhone, sessionId });
  return { ok: true, record: publicRecord(activated) };
}

export function listAccessKeys({ search = '' } = {}) {
  const q = normalizePhone(search) || String(search || '').toLowerCase();
  return Object.values(db.accessKeys.all())
    .map(markExpired)
    .filter(r => !q || normalizePhone(r.assignedPhone).includes(q) || String(r.assignedPhone || '').includes(q) || String(r.id).toLowerCase().includes(q) || String(r.plainKey || '').toLowerCase().includes(q))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(publicRecord);
}

export function getAccessKey(id) {
  const record = markExpired(db.accessKeys.get(id));
  if (!record) throw new Error('Access key not found');
  return publicRecord(record);
}

export async function assignAccessKey(id, phone, actor = 'admin') {
  const assignedPhone = normalizePhone(phone);
  if (!assignedPhone) throw new Error('Valid WhatsApp phone number is required');
  const record = db.accessKeys.get(id);
  if (!record) throw new Error('Access key not found');
  const patch = withHistory({ ...record, assignedPhone }, 'assign', actor, { fromPhone: record.assignedPhone, assignedPhone });
  for (const [authId, auth] of Object.entries(db.accessAuthorizations.all())) {
    if (auth.accessKeyId === id) db.accessAuthorizations.delete(authId);
  }
  await persistAccessKey(patch);
  db.accessKeys.set(id, patch);
  await saveNow('accessKeys').catch(() => {});
  await saveNow('accessAuthorizations').catch(() => {});
  await syncSheet(publicRecord(patch), 'assigned');
  console.log('[ACCESS] Key assigned', { id, phone: assignedPhone });
  return publicRecord(patch);
}

export function getAccessKeyHistory(id) {
  return getAccessKey(id).history || [];
}

export async function updateAccessKeyStatus(id, status, actor = 'admin') {
  if (status === 'suspended') status = 'disabled';
  if (!KEY_STATUSES.has(status)) throw new Error('Invalid status');
  const record = db.accessKeys.get(id);
  if (!record) throw new Error('Access key not found');
  let patch = withHistory({ ...record, status }, status === 'disabled' ? 'suspend' : status, actor);
  if (status === 'revoked') patch.revokedAt = now();
  if (['revoked', 'disabled', 'expired'].includes(status)) {
    for (const [authId, auth] of Object.entries(db.accessAuthorizations.all())) {
      if (auth.accessKeyId === id) db.accessAuthorizations.delete(authId);
    }
  }
  await persistAccessKey(patch);
  db.accessKeys.set(id, patch);
  await saveNow('accessKeys').catch(() => {});
  await saveNow('accessAuthorizations').catch(() => {});
  await syncSheet(publicRecord(patch), status);
  console.log(`[ACCESS] Key ${status}`, { id, phone: record.assignedPhone });
  return publicRecord(patch);
}

export async function deleteAccessKey(id) {
  const record = db.accessKeys.get(id);
  if (!record) throw new Error('Access key not found');
  const authorizationIds = Object.entries(db.accessAuthorizations.all())
    .filter(([, auth]) => auth.accessKeyId === id)
    .map(([authId]) => authId);
  // Do not rely on the cache flush for deletion: remove the exact documents
  // from MongoDB before reporting a successful endpoint response.
  if (!await deleteDocument('accessKeys', id)) throw new Error('MongoDB is not configured; access key was not deleted');
  const authorizationDeletes = await Promise.all(authorizationIds.map(authId => deleteDocument('accessAuthorizations', authId)));
  if (authorizationDeletes.some(deleted => !deleted)) throw new Error('MongoDB is not configured; authorization was not deleted');
  db.accessKeys.delete(id);
  for (const authId of authorizationIds) db.accessAuthorizations.delete(authId);
  await saveNow('accessKeys').catch(() => {});
  await saveNow('accessAuthorizations').catch(() => {});
  await syncSheet({ ...publicRecord(record), status: 'deleted', deletedAt: now() }, 'deleted');
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
