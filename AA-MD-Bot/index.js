// Load .env from the project root — works with plain `pm2 restart aa-md-bot`,
// `node index.js`, `npm start`, or any other launch method.
// Uses override:false so vars already in the environment (set by shell/PM2) take precedence.
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
try {
  const _dotenv = _require('dotenv');
  const _path   = _require('path');
  const _url    = _require('url');
  const _dir    = _path.dirname(_url.fileURLToPath(import.meta.url));
  _dotenv.config({ path: _path.join(_dir, '.env'), override: false });
} catch {}

// Ensure common binary locations are in PATH (works on Replit, Railway, VPS, etc.)
const extraPaths = ['/home/runner/.local/bin', '/usr/local/bin', '/usr/bin'];
for (const p of extraPaths) {
  if (!process.env.PATH?.includes(p)) process.env.PATH = `${p}:${process.env.PATH || ''}`;
}

import http from 'http';
import zlib from 'zlib';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import QRCode from 'qrcode';
import { logger } from './lib/logger.js';
import { db, initDatabase } from './lib/database.js';
import { loadAllPlugins, getCategories, plugins } from './lib/pluginLoader.js';
import { handleMessage } from './lib/commandHandler.js';
import {
  initAllSessions, setMessageHandler, setConnectionHandler, sessions,
  getAllSessions, botEvents, sessionQRs, sessionStatus, sessionInfo,
  createSession, deleteSession,
} from './lib/sessionManager.js';
import config from './config.js';
import { cleanTemp, formatDuration } from './lib/helper.js';
import { startBirthdayScheduler } from './plugins/utility/birthday.js';
import { initTelegramAdmin }    from './lib/telegramAdmin.js';
import { initTelegramFeatures } from './lib/telegramFeatures.js';
import { generateAccessKey, listAccessKeys, updateAccessKeyStatus, deleteAccessKey, verifyAccessKey, isAuthorized, normalizePhone, getAccessKeySecuritySettings } from './lib/accessKeys.js';

// ── AntiEdit Listener Import ──────────────────────────────────────────────
import { attachEditListener } from './plugins/group/antiedit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startTime = Date.now();
const dashboardPath = path.join(__dirname, 'dashboard.html');

// ── Log ring buffer (captures stdout for /admin/logs) ───────────────────────
const _logBuffer = [];
const _origStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, ...args) {
  try {
    const line = (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)).trim();
    if (line) {
      _logBuffer.push({ ts: Date.now(), line });
      if (_logBuffer.length > 300) _logBuffer.shift();
    }
  } catch {}
  return _origStdoutWrite(chunk, ...args);
};

// Flush pending MongoDB writes before crashing so no settings are lost.
// flushAll is imported lazily to avoid circular import at module init time.
async function _emergencyFlush(label, err) {
  logger.error({ err: String(err?.message || err) }, label);
  try {
    const { flushAll } = await import('./lib/database.js');
    await flushAll();
  } catch {}
}
process.on('uncaughtException',   err => _emergencyFlush('💥 Uncaught Exception',    err));
process.on('unhandledRejection',  err => _emergencyFlush('💥 Unhandled Rejection',   err));

// SSE clients
const sseClients = new Set();
const latestPairingCodes = new Map(); // sessionId → code

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

botEvents.on('qr', d => broadcast('qr', d));
botEvents.on('status', d => broadcast('status', d));
botEvents.on('pairingCode', d => {
  latestPairingCodes.set(d.sessionId, d.code);
  broadcast('pairingCode', d);
});
botEvents.on('pairingCodeError', d => broadcast('pairingCodeError', d));

// Helper: strip /api prefix
function stripApi(p) { return p.replace(/^\/api/, '') || '/'; }

// ── Admin Auth ─────────────────────────────────────────────────────────────
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';
const _AUTH_SECRET = process.env.SESSION_SECRET || 'aa-md-bot-admin-key';

function _makeToken() {
  return crypto.createHmac('sha256', _AUTH_SECRET).update(ADMIN_PASS).digest('hex');
}
function _parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) out[c.slice(0, idx).trim()] = c.slice(idx + 1).trim();
  });
  return out;
}
function _isAdmin(req) {
  if (!ADMIN_PASS) return false;
  return _parseCookies(req).adminToken === _makeToken();
}

function printBanner() {
  console.log(chalk.cyan.bold(`
╔══════════════════════════════════════╗
║       AA MD BOT  v${config.version}           ║
║   Developer: Ahsan Ali Wadani       ║
║        Brand: AA Mods               ║
║   Multi-Device WhatsApp Bot         ║
╚══════════════════════════════════════╝`));
}

async function startServer() {
  const port = parseInt(process.env.PORT || '5000', 10);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost`);

    // ── Full CORS — required for Vercel / external frontends ──
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Bare /api → health (for deployment healthcheck) ────
    if (url.pathname === '/api' || url.pathname === '/api/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', bot: config.botName, version: config.version,
        uptime: formatDuration(Date.now() - startTime),
        sessions: getAllSessions().length, plugins: plugins.size,
      }));
      return;
    }

    const p = stripApi(url.pathname);

    // ── Dashboard HTML ─────────────────────────────────────
    if (p === '/' || p === '' || p === '/dashboard') {
      try {
        const html = await fs.readFile(dashboardPath, 'utf8');
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Vary': 'Accept-Encoding' };
        if (acceptEncoding.includes('gzip')) {
          const compressed = await new Promise((resolve, reject) => zlib.gzip(Buffer.from(html), (e, b) => e ? reject(e) : resolve(b)));
          res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
          res.end(compressed);
        } else {
          res.writeHead(200, headers);
          res.end(html);
        }
      } catch {
        res.writeHead(500); res.end('Dashboard file missing');
      }
      return;
    }

    // ── SSE ────────────────────────────────────────────────
    if (p === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      sseClients.add(res);

      for (const [sessionId, qr] of sessionQRs) {
        res.write(`event: qr\ndata: ${JSON.stringify({ sessionId, qr })}\n\n`);
      }
      for (const [sessionId, status] of sessionStatus) {
        res.write(`event: status\ndata: ${JSON.stringify({ sessionId, status })}\n\n`);
      }
      for (const [sessionId, code] of latestPairingCodes) {
        res.write(`event: pairingCode\ndata: ${JSON.stringify({ sessionId, code })}\n\n`);
      }

      const keepAlive = setInterval(() => {
        try { res.write(':ping\n\n'); } catch { clearInterval(keepAlive); }
      }, 20000);

      req.on('close', () => { sseClients.delete(res); clearInterval(keepAlive); });
      return;
    }

    // ── QR Image ───────────────────────────────────────────
    if (p === '/qr-image') {
      const sessionId = url.searchParams.get('session') || 'default';
      const qr = sessionQRs.get(sessionId);
      if (!qr) { res.writeHead(404); res.end('No QR'); return; }
      try {
        const png = await QRCode.toBuffer(qr, { width: 280, margin: 2, color: { dark: '#000', light: '#fff' } });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
        res.end(png);
      } catch { res.writeHead(500); res.end('QR error'); }
      return;
    }

    // ── Health ─────────────────────────────────────────────
    if (p === '/healthz' || p === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', bot: config.botName, version: config.version,
        uptime: formatDuration(Date.now() - startTime),
        sessions: getAllSessions().length, plugins: plugins.size,
      }));
      return;
    }

    // ── Stats ──────────────────────────────────────────────
    if (p === '/stats') {
      const cats = getCategories();
      const sessList = getAllSessions();
      const catCounts = {};
      for (const [cat, cmds] of Object.entries(cats)) catCounts[cat] = cmds.length;
      const safeSessions = sessList.map(s => ({
        id: s.id,
        name: s.name || null,
        status: s.status,
        connectedAt: s.connectedAt || null,
      }));
      const ramMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        uptime: formatDuration(Date.now() - startTime),
        plugins: plugins.size,
        groups: Object.keys(db.groups.all()).length,
        sessions: safeSessions,
        connectedSessions: safeSessions.filter(s => s.status === 'connected').length,
        categories: catCounts,
        ram: ramMB,
      }));
      return;
    }

    // ── Status ──
    if (p === '/status') {
      const connected = getAllSessions().filter(s => s.status === 'connected').length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        bot: config.botName,
        version: config.version,
        sessions: connected,
        maxSessions: null,
        uptime: formatDuration(Date.now() - startTime),
      }));
      return;
    }

    // ── Latest pairing code per session ─────
    if (p === '/pairing-code') {
      const sid = url.searchParams.get('session') || 'default';
      const code = latestPairingCodes.get(sid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: code || null }));
      return;
    }

    // ── Create Session ─────────────────────────────────────
    if (p === '/session/create' && req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { sessionId = 'default', method = 'qr', phoneNumber } = JSON.parse(body || '{}');
          const cleanId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'default';

          if (method === 'pairing' && !phoneNumber) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Phone number required' }));
            return;
          }

          if (sessions.has(cleanId)) {
            const sock = sessions.get(cleanId);
            if (sock.ws?.readyState === 1) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, sessionId: cleanId, info: 'Already connected' }));
              return;
            }
            sessions.delete(cleanId);
            try { sock.end(new Error('restart')); } catch {}
          }

          latestPairingCodes.delete(cleanId);
          await createSession(cleanId, method === 'pairing', phoneNumber);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, sessionId: cleanId, method }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── Delete Session ─────────────────────────────────────
    const delMatch = p.match(/^\/session\/([^/]+)$/);
    if (delMatch && req.method === 'DELETE') {
      try {
        await deleteSession(delMatch[1]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // ── Auth: login ────────────────────────────────────────
    if (p === '/auth/login' && req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const { password } = JSON.parse(body || '{}');
          if (!ADMIN_PASS) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'ADMIN_PASSWORD not set in .env or Secrets' }));
          }
          if (password !== ADMIN_PASS) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'Incorrect password' }));
          }
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `adminToken=${_makeToken()}; Path=/; HttpOnly; SameSite=Strict`,
          });
          res.end(JSON.stringify({ ok: true }));
        } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'Bad request' })); }
      });
      return;
    }

    // ── Auth: check ────────────────────────────────────────
    if (p === '/auth/check') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: _isAdmin(req), passwordSet: !!ADMIN_PASS }));
      return;
    }

    // ── Auth: logout ────────────────────────────────────────
    if (p === '/auth/logout') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'adminToken=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ── Access Key verification/status ───────────────────────
    if (p === '/access-keys/status' && req.method === 'GET') {
      const sessionId = url.searchParams.get('session') || 'default';
      const sock = sessions.get(sessionId);
      const actualPhone = normalizePhone(sock?.user?.id || sessionInfo.get(sessionId)?.phone || '');
      if (!sock || !actualPhone) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'Session not connected' })); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sessionId, authorized: isAuthorized(sessionId, actualPhone) }));
      return;
    }

    if (p === '/access-keys/verify' && req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { sessionId = 'default', accessKey } = JSON.parse(body || '{}');
          const sock = sessions.get(sessionId);
          const actualPhone = normalizePhone(sock?.user?.id || sessionInfo.get(sessionId)?.phone || '');
          if (!sock || !actualPhone) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'Session not connected' })); }
          const result = await verifyAccessKey({ plainKey: accessKey, phone: actualPhone, sessionId });
          const safeError = result.ok ? null : (result.reason === 'wrong_phone' ? 'Access Key is not authorized for this WhatsApp number' : result.reason === 'rate_limited' ? 'Too many attempts. Try again later.' : 'Invalid Access Key');
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: result.ok, authorized: result.ok, error: safeError, reason: result.ok ? undefined : result.reason }));
        } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Bad request' })); }
      });
      return;
    }

    // ── Admin: Access Keys ──────────────────────────────────
    if (p === '/admin/access-keys' && req.method === 'GET') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      const keys = listAccessKeys({ search: url.searchParams.get('search') || '' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, keys }));
      return;
    }

    if (p === '/admin/access-keys/generate' && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { phone, expiresAt = null, expiresInDays = null, connectionId = null } = JSON.parse(body || '{}');
          const exp = expiresInDays ? Date.now() + Number(expiresInDays) * 86400000 : expiresAt;
          const out = await generateAccessKey({ phone, expiresAt: exp, createdBy: 'admin-panel', connectionId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, accessKey: out.key, record: out.record }));
        } catch (err) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: err.message })); }
      });
      return;
    }

    const akAction = p.match(/^\/admin\/access-keys\/([^/]+)\/(revoke|disable|activate|delete|regenerate)$/);
    if (akAction && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      try {
        const [, id, action] = akAction;
        if (action === 'delete') { await deleteAccessKey(id); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true })); }
        if (action === 'regenerate') {
          const old = db.accessKeys.get(id);
          if (!old) throw new Error('Access key not found');
          const out = await generateAccessKey({ phone: old.assignedPhone, expiresAt: old.expiresAt, createdBy: 'admin-panel', connectionId: old.connectionId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, accessKey: out.key, record: out.record }));
        }
        const status = action === 'revoke' ? 'revoked' : action === 'disable' ? 'disabled' : 'active';
        const record = await updateAccessKeyStatus(id, status);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, record }));
      } catch (err) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: err.message })); }
      return;
    }

    // ── Admin: sessions list ────────────────────────────────
    if (p === '/admin/sessions') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      const all = getAllSessions();
      const result = all.map(s => ({
        id:          s.id,
        phone:       s.phone || s.id,
        name:        s.name  || null,
        status:      s.status,
        connectedAt: s.connectedAt || null,
        jid:         s.jid   || null,
        accessAuthorized: isAuthorized(s.id, s.phone || s.jid || s.id),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions: result, total: result.length, connected: result.filter(s => s.status === 'connected').length }));
      return;
    }

    // ── Admin: detailed stats ────────────────────────────────
    if (p === '/admin/stats') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      const cats = getCategories();
      const catCounts = {};
      for (const [cat, cmds] of Object.entries(cats)) catCounts[cat] = cmds.length;
      const mem = process.memoryUsage();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        uptime:     formatDuration(Date.now() - startTime),
        uptimeMs:   Date.now() - startTime,
        plugins:    plugins.size,
        groups:     Object.keys(db.groups.all()).length,
        categories: catCounts,
        ram:        Math.round(mem.heapUsed  / 1024 / 1024),
        ramTotal:   Math.round(mem.heapTotal / 1024 / 1024),
        version:    config.version,
        botName:    config.botName,
        serverId:   process.env.SERVER_ID || 'server-1',
      }));
      return;
    }

    // ── Admin: get settings ──────────────────────────────────
    if (p === '/admin/settings' && req.method === 'GET') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      const sv = k => db.settings.getValue(k);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        prefix:          sv('prefix')          ?? config.prefix          ?? ['.'],
        botMode:         sv('botMode')         ?? config.botMode         ?? 'public',
        autoRead:        sv('autoRead')        ?? config.autoRead        ?? true,
        autoTyping:      sv('autoTyping')      ?? config.autoTyping      ?? true,
        autoStatusView:  sv('autoStatusView')  ?? config.autoStatusView  ?? true,
        autoStatusReact: sv('autoStatusReact') ?? config.autoStatusReact ?? true,
        antiSpam:        sv('antiSpam')        ?? config.antiSpam        ?? true,
        antiCall:        sv('antiCall')        ?? config.antiCall        ?? false,
        antiDelete:      sv('antiDelete')      ?? config.antiDelete      ?? false,
        antiEdit:        sv('antiEdit')        ?? config.antiEdit        ?? false,
        antiViewOnce:    sv('antiViewOnce')    ?? config.antiViewOnce    ?? false,
        maintenanceMode: sv('maintenanceMode') ?? config.maintenanceMode ?? false,
        statusEmoji:     sv('statusEmoji')     ?? config.statusEmoji     ?? '❤️',
        welcomeMessage:  sv('welcomeMessage')  ?? config.welcomeMessage  ?? true,
        accessKeysEnforced: String(sv('ACCESS_KEYS_ENFORCED') ?? sv('accessKeysEnforced') ?? process.env.ACCESS_KEYS_ENFORCED ?? 'false').toLowerCase() === 'true',
        accessKeySecurity: getAccessKeySecuritySettings(),
      }));
      return;
    }

    // ── Admin: save settings ─────────────────────────────────
    if (p === '/admin/settings' && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const allowed = ['prefix','botMode','autoRead','autoTyping','autoStatusView','autoStatusReact','antiSpam','antiCall','antiDelete','antiEdit','antiViewOnce','maintenanceMode','statusEmoji','welcomeMessage','accessKeysEnforced','ACCESS_KEYS_ENFORCED','ACCESS_KEY_VERIFY_LIMIT','ACCESS_KEY_VERIFY_WINDOW_MS','ACCESS_KEY_HASH_ITERATIONS','ACCESS_KEY_PEPPER'];
          for (const key of allowed) {
            if (!(key in data)) continue;
            if (key === 'ACCESS_KEY_PEPPER' && !String(data[key] || '').trim()) continue;
            db.settings.setValue(key, data[key]);
          }
          if ('accessKeysEnforced' in data) db.settings.setValue('ACCESS_KEYS_ENFORCED', !!data.accessKeysEnforced);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'Bad request' })); }
      });
      return;
    }

    // ── Admin: disconnect session ────────────────────────────
    const admDel = p.match(/^\/admin\/session\/([^/]+)$/);
    if (admDel && req.method === 'DELETE') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      try {
        await deleteSession(admDel[1]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // ── Admin: log viewer ───────────────────────────────────
    if (p === '/admin/logs') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '150', 10), 300);
      const since = parseInt(url.searchParams.get('since') || '0', 10);
      const logs  = _logBuffer.filter(l => l.ts > since).slice(-limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ logs, lastTs: _logBuffer.length ? _logBuffer[_logBuffer.length - 1].ts : 0 }));
      return;
    }

    // ── Admin: storage info ─────────────────────────────────
    if (p === '/admin/storage' && req.method === 'GET') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      try {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileP = promisify(execFile);
        let total = 0, used = 0, avail = 0;
        try {
          const df = await execFileP('df', ['-k', __dirname]);
          const parts = df.stdout.trim().split('\n')[1]?.split(/\s+/);
          if (parts) { total = parseInt(parts[1]) * 1024; used = parseInt(parts[2]) * 1024; avail = parseInt(parts[3]) * 1024; }
        } catch {}
        const folderNames = ['downloads', 'temp', 'logs', 'cache'];
        const folders = {};
        for (const f of folderNames) {
          try {
            const du = await execFileP('du', ['-sk', path.join(__dirname, f)]);
            folders[f] = parseInt(du.stdout.split('\t')[0]) * 1024;
          } catch { folders[f] = 0; }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, total, used, avail, folders }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // ── Admin: cleanup folders ───────────────────────────────
    if (p === '/admin/cleanup' && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { folders: toClean = ['downloads', 'temp'] } = JSON.parse(body || '{}');
          const allowed = ['downloads', 'temp', 'logs', 'cache'];
          let freed = 0, count = 0;
          for (const folder of toClean) {
            if (!allowed.includes(folder)) continue;
            const dir = path.join(__dirname, folder);
            try {
              const files = await fs.readdir(dir);
              for (const file of files) {
                try {
                  const fp = path.join(dir, file);
                  const stat = await fs.stat(fp);
                  if (stat.isFile()) { freed += stat.size; await fs.unlink(fp); count++; }
                } catch {}
              }
            } catch {}
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, freed, count }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── Admin: broadcast message ─────────────────────────────
    if (p === '/admin/broadcast' && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { message: rawMsg, targetSession, image, imageMime } = JSON.parse(body || '{}');
          const message = (rawMsg || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          if (!message.trim() && !image) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'message or image is required' }));
          }
          let imgBuf = null;
          let imgMime = imageMime || 'image/jpeg';
          if (image) {
            try { imgBuf = Buffer.from(image, 'base64'); if (imgBuf.length < 100) imgBuf = null; } catch { imgBuf = null; }
          }
          const header = `📢 *Admin Broadcast*`;
          const targets = targetSession ? [targetSession] : [...sessions.keys()];
          let sent = 0, failed = 0;
          for (const sid of targets) {
            const sock = sessions.get(sid);
            if (!sock || sessionStatus.get(sid) !== 'connected') { failed++; continue; }
            try {
              const selfId  = sock.user?.id || '';
              const ownerRaw = db.settings.getValue(`owner_${sid}`) || db.settings.getValue('owner') || '';
              const jid = selfId
                ? selfId
                : (ownerRaw.includes('@') ? ownerRaw : `${ownerRaw.replace(/\D/g, '')}@s.whatsapp.net`);
              if (jid && jid.length > 10) {
                if (imgBuf) {
                  const caption = message.trim()
                    ? `${header}\n\n${message.trim()}`
                    : header;
                  await sock.sendMessage(jid, { image: imgBuf, mimetype: imgMime, caption });
                } else {
                  await sock.sendMessage(jid, { text: `${header}\n\n${message.trim()}` });
                }
                sent++;
                await new Promise(r => setTimeout(r, 600));
              } else failed++;
            } catch { failed++; }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, sent, failed, total: targets.length }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message || 'Bad request' }));
        }
      });
      return;
    }

    // ── Admin: database management ───────────────────────────────────────────
    if (p === '/admin/db' && req.method === 'GET') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      const col = new URL(req.url, 'http://localhost').searchParams.get('collection');
      const ALLOWED_COLS = ['groups', 'settings', 'sessionSettings', 'notes', 'birthdays', 'sessions', 'reminders', 'accessKeys', 'accessAuthorizations'];
      if (!col || !ALLOWED_COLS.includes(col)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, collections: ALLOWED_COLS }));
      }
      let data;
      if (col === 'settings') data = db.settings.get();
      else if (col === 'sessionSettings') data = db.sessionSettings.all();
      else if (col === 'groups') data = db.groups.all();
      else if (col === 'sessions') data = db.sessions.all();
      else if (col === 'notes') { try { data = db.notes.all(); } catch { data = {}; } }
      else if (col === 'birthdays') { try { data = db.birthdays?.all?.() || {}; } catch { data = {}; } }
      else if (col === 'reminders') { try { data = db.reminders?.all?.() || {}; } catch { data = {}; } }
      else if (col === 'accessKeys') { try { data = db.accessKeys?.all?.() || {}; } catch { data = {}; } }
      else if (col === 'accessAuthorizations') { try { data = db.accessAuthorizations?.all?.() || {}; } catch { data = {}; } }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, collection: col, data: data || {} }));
    }

    if (p === '/admin/db/set' && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const { collection, key, value } = JSON.parse(body || '{}');
          const ALLOWED_COLS = ['groups', 'settings', 'sessionSettings', 'notes', 'sessions', 'accessKeys', 'accessAuthorizations'];
          if (!ALLOWED_COLS.includes(collection)) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'Invalid collection' })); }
          const val = typeof value === 'string' ? JSON.parse(value) : value;
          if (collection === 'settings') {
            if (!key) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'key required' })); }
            db.settings.setValue(key, val);
          } else if (collection === 'sessions') {
            db.sessions.set(key, val);
          } else if (collection === 'groups') {
            const [sId, gId] = key.split('|');
            if (!gId) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'key must be sessionId|groupId' })); }
            db.groups.set(sId, gId, val);
          } else if (collection === 'sessionSettings') {
            const [sId, k] = key.split('|');
            if (!k) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'key must be sessionId|field' })); }
            db.sessionSettings.setValue(sId, k, val);
          } else if (collection === 'accessKeys') {
            db.accessKeys.set(key, val);
          } else if (collection === 'accessAuthorizations') {
            db.accessAuthorizations.set(key, val);
          } else if (collection === 'notes') {
            const [jid, noteName] = key.split('|');
            if (!noteName) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'key must be jid|noteName' })); }
            db.notes.setNote(jid, noteName, val);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    if (p === '/admin/db/delete' && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const { collection, key } = JSON.parse(body || '{}');
          const ALLOWED_COLS = ['groups', 'settings', 'sessionSettings', 'notes', 'sessions', 'accessKeys', 'accessAuthorizations'];
          if (!ALLOWED_COLS.includes(collection)) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Invalid collection' })); }
          if (collection === 'settings') {
            const d = db.settings.get(); delete d[key]; db.settings.set({});
            Object.keys(d).forEach(k => db.settings.setValue(k, d[k]));
          } else if (collection === 'groups') {
            const [sId, gId] = key.split('|');
            if (gId) db.groups.delete(sId, gId);
          } else if (collection === 'sessions') {
            db.sessions.delete(key);
          } else if (collection === 'notes') {
            const [jid, noteName] = key.split('|');
            if (noteName) db.notes.delNote(jid, noteName); else db.notes.clear(jid);
          } else if (collection === 'sessionSettings') {
            const [sId] = key.split('|');
            db.sessionSettings.delete(sId);
          } else if (collection === 'accessKeys') {
            db.accessKeys.delete(key);
          } else if (collection === 'accessAuthorizations') {
            db.accessAuthorizations.delete(key);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── Admin: restart ───────────────────────────────────────────────────────
    if (p === '/admin/restart' && req.method === 'POST') {
      if (!_isAdmin(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Unauthorized' })); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Bot process will restart in 2s' }));
      setTimeout(() => process.exit(0), 2000);
      return;
    }

    // ── Static images ──────────────────────────────────────
    const STATIC_IMAGES = {
      '/banner.webp': 'image/webp',
      '/logo.webp': 'image/webp',
      '/favicon.webp': 'image/webp',
      '/banner.jpeg': 'image/jpeg',
      '/logo.jpeg': 'image/jpeg',
      '/favicon.svg': 'image/svg+xml',
    };
    if (STATIC_IMAGES[p]) {
      const imgPath = path.join(__dirname, p.slice(1));
      try {
        const data = await fs.readFile(imgPath);
        res.writeHead(200, { 'Content-Type': STATIC_IMAGES[p], 'Cache-Control': 'public, max-age=31536000, immutable', 'Vary': 'Accept' });
        res.end(data);
      } catch { res.writeHead(404); res.end('Not found'); }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error({ port }, `❌ Port ${port} already in use — another bot instance is running. Exiting so workflow can restart cleanly.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port }, '🌐 Dashboard server listening');
    console.log(chalk.green(`\n🌐 Dashboard: http://localhost:${port}/\n`));
  });

  return server;
}

// ── Handlers Wire-up ─────────────────────────────────────────────────────
setMessageHandler(handleMessage);

// Connection Handler with Auto AntiEdit Listener Binding
setConnectionHandler((sessionId, sock) => {
  console.log(chalk.green(`✅ Session [${sessionId}] connected as ${sock.user?.name || sock.user?.id}`));
  
  // Attach AntiEdit listener automatically on session connection/reconnect
  try {
    attachEditListener(sock, db);
  } catch (err) {
    logger.error({ err: err.message }, `[AntiEdit] Failed to attach listener for session [${sessionId}]`);
  }
});

async function main() {
  printBanner();
  logger.info('🚀 Starting AA MD Bot...');

  for (const dir of ['temp', 'logs', 'session', 'downloads', 'database', 'cache']) {
    fs.ensureDirSync(path.join(__dirname, dir));
  }

  await initDatabase();

  try {
    const savedJid  = db.settings.getValue('newsletterJid') || config.newsletterJid;
    const savedName = db.settings.getValue('newsletterName') || config.newsletterName || 'AA MD Bot';
    if (savedJid) {
      global._AA_NEWSLETTER_JID  = savedJid;
      global._AA_NEWSLETTER_NAME = savedName;
      if (!db.settings.getValue('newsletterJid')) {
        db.settings.setValue('newsletterJid', savedJid);
        db.settings.setValue('newsletterName', savedName);
      }
      logger.info({ jid: savedJid }, '📢 Newsletter JID restored from db');
    }
  } catch {}

  await startServer();

  logger.info('📦 Loading plugins...');
  const count = await loadAllPlugins();
  const cats = getCategories();
  const catList = Object.entries(cats).map(([k, v]) => `${k}(${v.length})`).join(', ');
  console.log(chalk.blue(`📦 Loaded ${count} plugins: ${catList}`));

  logger.info('📡 Initializing WhatsApp sessions...');
  await initAllSessions();

  // ── Birthday scheduler ──────────────────────────────────────────────────
  startBirthdayScheduler(() => sessions);

  // ── Fake Last Seen scheduler ───────────────────────────────────────────
  setInterval(() => {
    const now   = new Date();
    const hh    = String(now.getHours()).padStart(2, '0');
    const mm    = String(now.getMinutes()).padStart(2, '0');
    const curHHMM = `${hh}:${mm}`;

    for (const [sessionId, sock] of sessions.entries()) {
      try {
        const active = db.sessionSettings.getValue(sessionId, 'fake_lastseen_active');
        if (!active) continue;
        const target = db.sessionSettings.getValue(sessionId, 'fake_lastseen_time');
        if (!target || target !== curHHMM) continue;
        sock.sendPresenceUpdate('unavailable').catch(() => {});
        logger.info({ sessionId, time: curHHMM }, '🕐 Fake last seen fired');
      } catch {}
    }
  }, 60_000);

  // ── Telegram bots ─────────────────────────────────────────────────────────
  try {
    initTelegramAdmin({
      createSession,
      deleteSession,
      getAllSessions: () => getAllSessions(),
      latestPairingCodes,
      botEvents,
    });
  } catch (e) {
    logger.warn({ err: e.message }, '📱 Telegram admin bot failed to start');
  }
  try {
    initTelegramFeatures();
  } catch (e) {
    logger.warn({ err: e.message }, '🤖 Telegram features bot failed to start');
  }

  setInterval(cleanTemp, 30 * 60 * 1000);

  console.log(chalk.cyan.bold('\n✨ AA MD Bot is ready!\n'));
}

main().catch(err => {
  logger.error({ err: err.message }, '💥 Fatal startup error');
  process.exit(1);
});
