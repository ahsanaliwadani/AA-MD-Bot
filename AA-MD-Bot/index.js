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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startTime = Date.now();
const dashboardPath = path.join(__dirname, 'dashboard.html');

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

      // Send current QR immediately if available
      for (const [sessionId, qr] of sessionQRs) {
        res.write(`event: qr\ndata: ${JSON.stringify({ sessionId, qr })}\n\n`);
      }
      // Send current session statuses
      for (const [sessionId, status] of sessionStatus) {
        res.write(`event: status\ndata: ${JSON.stringify({ sessionId, status })}\n\n`);
      }
      // Send any cached pairing codes
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
      // Strip phone/jid from session data before sending to dashboard
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

    // ── Status — for external frontends (Vercel etc) ──────
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

    // ── Latest pairing code per session (for polling) ─────
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

          // If session already exists and connected, return early; otherwise close it
          if (sessions.has(cleanId)) {
            const sock = sessions.get(cleanId);
            if (sock.ws?.readyState === 1) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, sessionId: cleanId, info: 'Already connected' }));
              return;
            }
            // Close stale session cleanly before recreating
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
            'Set-Cookie': `adminToken=${_makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
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
        maintenanceMode: sv('maintenanceMode') ?? config.maintenanceMode ?? false,
        statusEmoji:     sv('statusEmoji')     ?? config.statusEmoji     ?? '❤️',
        welcomeMessage:  sv('welcomeMessage')  ?? config.welcomeMessage  ?? true,
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
          const allowed = ['prefix','botMode','autoRead','autoTyping','autoStatusView','autoStatusReact','antiSpam','maintenanceMode','statusEmoji','welcomeMessage'];
          for (const key of allowed) { if (key in data) db.settings.setValue(key, data[key]); }
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

setMessageHandler(handleMessage);
setConnectionHandler((sessionId, sock) => {
  console.log(chalk.green(`✅ Session [${sessionId}] connected as ${sock.user?.name || sock.user?.id}`));
});

async function main() {
  printBanner();
  logger.info('🚀 Starting AA MD Bot...');

  // Ensure all required directories exist (created on every startup — safe to repeat)
  for (const dir of ['temp', 'logs', 'session', 'downloads', 'database', 'cache']) {
    fs.ensureDirSync(path.join(__dirname, dir));
  }

  // Load persistent database state before anything reads from db
  await initDatabase();

  // Restore newsletter JID — db first (set via .setnewsletter), then config fallback
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

  // ── Birthday scheduler — runs at exactly midnight every day ───────────────
  startBirthdayScheduler(() => sessions);

  // ── Fake Last Seen scheduler — checks every minute ────────────────────────
  // For each session that has fake_lastseen_active=true, fires sendPresenceUpdate('unavailable')
  // at the exact HH:MM the user configured, so WA records that moment as last seen.
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
        // Exact minute match — fire unavailable
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
