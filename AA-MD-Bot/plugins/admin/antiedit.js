// ── Anti-Edit Plugin ──────────────────────────────────────────────────────────
// Catches edited messages and forwards them silently to owner's self-chat only.
// Group members never see the alert — completely private.
import { db } from '../../lib/database.js';

export default {
  command:     'antiedit',
  category:    'admin',
  description: 'Catch edited messages → silently forwarded to (You) chat',
  usage:       '.antiedit on/off',
  isOwner:     true,

  async execute({ sock, msg, args, reply, sessionId }) {
    const jid     = msg.key.remoteJid;
    const isGroup = jid?.endsWith('@g.us');
    const arg     = (args[0] || '').toLowerCase();

    if (!['on', 'off'].includes(arg)) {
      const cur = isGroup
        ? (db.groups.get(sessionId, jid)?.antiedit ?? db.settings.get()?.antiedit ?? false)
        : (db.settings.get()?.antiedit ?? false);
      return reply(
        `✏️ *Anti-Edit*\n\n` +
        `Status: *${cur ? '✅ ON' : '❌ OFF'}*\n\n` +
        `Usage: *.antiedit on* or *.antiedit off*\n\n` +
        `_Edited messages are caught and forwarded silently to your (You) chat._\n\n` +
        `> ✏️ *AA MD Bot*`
      );
    }

    const enable = arg === 'on';

    if (isGroup) {
      const grp = db.groups.get(sessionId, jid) || {};
      grp.antiedit = enable;
      db.groups.set(sessionId, jid, grp);
    } else {
      const settings = db.settings.get();
      settings.antiedit = enable;
      db.settings.set(settings);
    }

    return reply(
      `✏️ *Anti-Edit ${enable ? 'Enabled' : 'Disabled'}*\n\n` +
      `${enable
        ? '✅ Edited messages will now be silently forwarded to your (You) chat.'
        : '❌ Anti-Edit is now off.'
      }\n\n` +
      `> ✏️ *AA MD Bot*`
    );
  },
};
