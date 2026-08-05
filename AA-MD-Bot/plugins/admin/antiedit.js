// ============================================
// AA MD Bot - Anti Edit Plugin
// Developer: Ahsan Ali | AA Mods
// Works in groups (per-group) and DM (global for owner)
// Edited messages are forwarded silently to owner's (You) self-chat only.
// ============================================

import { saveNow } from '../../lib/database.js';

export default {
  command:     'antiedit',
  alias:       ['noedit', 'catchedit'],
  description: 'Catch edited messages → forwarded silently to (You) chat',
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
        `*.antiedit on*  — Catch edited messages silently\n` +
        `*.antiedit off* — Stop catching edits\n\n` +
        (isGroupMsg
          ? `📌 Applies to *this group only*`
          : `📌 From DM → applies *globally* to all groups & DMs`) +
        `\n\n_Edited messages are forwarded to your (You) chat — group never sees the alert._`
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
          ? 'Edited messages will be silently forwarded to your (You) chat.'
          : 'Edited messages will no longer be tracked.')
      );
    }

    // DM — owner only for global toggle
    if (!isOwner) {
      return reply('⚠️ Only the bot owner can set global anti-edit from DM.');
    }

    db.settings.setValue('antiedit', value);
    await saveNow('settings');
    return reply(
      `✏️ *Anti Edit* globally set to *${value ? 'ON ✅' : 'OFF ❌'}*.\n` +
      (value
        ? 'All edited messages (groups + DMs) will be forwarded to your (You) chat.'
        : 'Anti Edit is now disabled globally.')
    );
  },
};
