// ============================================
// AA MD Bot — Anti Edit Plugin
// Developer: Ahsan Ali | AA Mods
// When someone edits a message, bot shows original → owner self-chat
// Works per-group (admin sets it) or globally via DM (owner only)
// ============================================

import { saveNow } from '../../lib/database.js';

export default {
  command:     'antiedit',
  alias:       ['antiEdit', 'noedit'],
  description: 'Catch edited messages and show the original',
  category:    'admin',
  usage:       '.antiedit on/off',

  async execute({ reply, jid, args, isOwner, isGroupMsg, db }) {
    const toggle = args[0]?.toLowerCase();

    const currentVal = isGroupMsg
      ? (db.groups.get(jid)?.antiedit ?? db.settings.getValue('antiedit') ?? false)
      : (db.settings.getValue('antiedit') ?? false);

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `✏️ *Anti Edit* is currently *${currentVal ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*.antiedit on*  — Catch edited messages → sends original to (You)\n` +
        `*.antiedit off* — Ignore edits\n\n` +
        (isGroupMsg
          ? `📌 Applies to *this group only*`
          : `📌 From DM → applies *globally* to all groups & DMs`)
      );
    }

    const value = toggle === 'on';

    if (isGroupMsg) {
      const group = db.groups.get(jid) || {};
      db.groups.set(jid, { ...group, antiedit: value });
      await saveNow('groups');
      return reply(
        `✏️ *Anti Edit* is now *${value ? 'ON ✅' : 'OFF ❌'}* for this group.\n` +
        (value
          ? 'Edited messages will be caught and sent to your (You) chat.'
          : 'Edited messages will be ignored.')
      );
    }

    if (!isOwner) return reply('⚠️ Only the bot owner can set global anti-edit from DM.');

    db.settings.setValue('antiedit', value);
    await saveNow('settings');
    return reply(
      `✏️ *Anti Edit* globally set to *${value ? 'ON ✅' : 'OFF ❌'}*.\n` +
      (value
        ? 'Edited messages will be caught in ALL groups and DMs.'
        : 'Anti-edit disabled globally.')
    );
  },
};
