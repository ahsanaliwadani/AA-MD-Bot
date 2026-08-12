// ============================================
// AA MD Bot - Always Online (GB WhatsApp Feature)
// Per-number: each connected number has its own always-online
// ============================================

import { db, saveNow } from '../../lib/database.js';

// Per-session interval map — prevents one number from controlling another
const _intervals = new Map(); // sessionId → intervalId

// Exported so ghost.js can stop the interval when enabling ghost mode
export function stopAlwaysOnline(sessionId, sock = null) {
  if (_intervals.has(sessionId)) {
    clearInterval(_intervals.get(sessionId));
    _intervals.delete(sessionId);
  }
  if (sock) sock.sendPresenceUpdate('unavailable').catch(() => {});
}

export function startAlwaysOnline(sock, sessionId) {
  stopAlwaysOnline(sessionId);
  const iv = setInterval(async () => {
    try { await sock.sendPresenceUpdate('available'); } catch {}
  }, 10000);
  _intervals.set(sessionId, iv);
  sock.sendPresenceUpdate('available').catch(() => {});
}

export function shouldSendOnlinePresence(sessionId) {
  const enabled = !!db.sessionSettings.getValue(sessionId, 'alwaysOnline');
  const ghost = !!db.sessionSettings.getValue(sessionId, 'ghostMode');
  const fakeLastSeen = !!db.sessionSettings.getValue(sessionId, 'fake_lastseen_active');
  return enabled && !ghost && !fakeLastSeen;
}

export function sendOnlinePresence(sock, sessionId, presence, jid = undefined) {
  if (!shouldSendOnlinePresence(sessionId)) return Promise.resolve(false);
  return sock.sendPresenceUpdate(presence, jid).then(() => true).catch(() => false);
}

export function syncAlwaysOnlinePresence(sock, sessionId) {
  if (shouldSendOnlinePresence(sessionId)) startAlwaysOnline(sock, sessionId);
  else stopAlwaysOnline(sessionId, sock);
}

export default {
  command: 'alwaysonline',
  alias: ['onlinemode', 'keeponline', 'stayonline', 'ao'],
  category: 'gb',
  description: 'Always appear online on WhatsApp (per connected number)',
  usage: '.alwaysonline on/off',
  ownerOnly: true,

  async execute({ reply, args, sock, sessionId, sessionSettings }) {
    const toggle  = args[0]?.toLowerCase();
    const current = sessionSettings.get('alwaysOnline') ?? false;

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `🟢 *Always Online*\n` +
        `Status: *${current ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `*GB WhatsApp Feature* — Stay permanently online\n` +
        `⚠️ *Per number:* Only applies to this connected number.\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `▸ *.alwaysonline on*  — Always appear online\n` +
        `▸ *.alwaysonline off* — Normal online status\n\n` +
        `⚠️ Note: Ghost Mode & Always Online cannot be active together.\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    }

    const val = toggle === 'on';
    sessionSettings.set('alwaysOnline', val);

    if (val) {
      // Turn off ghost mode for this session
      sessionSettings.set('ghostMode', false);
      await saveNow('sessionSettings').catch(() => {});
      // Start/restart the interval for this session only
      startAlwaysOnline(sock, sessionId);
      return reply(
        `🟢 *Always Online* is now *ON ✅*\n\n` +
        `This number will appear *permanently online*.\n` +
        `Ghost Mode has been turned off.\n` +
        `Other connected numbers are *not affected*.\n\n` +
        `Use *.alwaysonline off* to stop.\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    } else {
      await saveNow('sessionSettings').catch(() => {});
      stopAlwaysOnline(sessionId, sock);
      return reply(
        `⚫ *Always Online* is now *OFF ❌*\n\n` +
        `This number's online status is back to normal.\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    }
  },
};
