// ============================================
// AA MD Bot - Ghost Mode (GB WhatsApp Feature)
// Per-number: each connected number has its own ghost mode
// ============================================

import { syncAlwaysOnlinePresence } from './alwaysonline.js';

export default {
  command: 'ghost',
  alias: ['ghostmode', 'invisible', 'offline'],
  category: 'gb',
  description: 'Appear offline while using bot (per connected number)',
  usage: '.ghost on/off',
  ownerOnly: true,

  async execute({ reply, args, sock, jid, sessionId, sessionSettings }) {
    const toggle  = args[0]?.toLowerCase();
    const current = sessionSettings.get('ghostMode') ?? false;

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `👻 *Ghost Mode*  —  *${current ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `*GB WhatsApp Feature*\n` +
        `When ON, this number appears offline even while active.\n` +
        `⚠️ *Per number:* Only applies to this connected number.\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `▸ *.ghost on*  — Go invisible\n` +
        `▸ *.ghost off* — Appear online normally\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    }

    const val = toggle === 'on';
    sessionSettings.set('ghostMode', val);

    if (val) {
      // Stop always-online interval for this session if running
      sessionSettings.set('alwaysOnline', false);
      try {
        const { stopAlwaysOnline } = await import('./alwaysonline.js');
        stopAlwaysOnline(sessionId);
      } catch {}
    }

    if (val) {
      await sock.sendPresenceUpdate('unavailable', jid).catch(() => {});
    } else {
      // Do not force the number online when ghost is disabled. If always-online
      // is off, keep the number unavailable while the bot continues working.
      syncAlwaysOnlinePresence(sock, sessionId);
    }

    return reply(
      `👻 *Ghost Mode* is now *${val ? 'ON ✅' : 'OFF ❌'}*\n\n` +
      (val
        ? `This number is now *invisible* 🕵️\nActive but appears offline to everyone.\nAlways Online has been stopped.`
        : `Ghost mode disabled. Bot keeps working offline; this number only shows online when *.alwaysonline on* is enabled.`)
    );
  },
};
