// ============================================
// AA MD Bot - Anti Edit Plugin
// Sends the original version of edited messages to owner's self chat.
// Works per-group or globally from DM, like anti-delete.
// ============================================

import { saveNow } from '../../lib/database.js';

export default {
  command: 'antiedit',
  alias: ['antieditmsg', 'noedit', 'editguard'],
  description: 'Recover original messages when someone edits them',
  category: 'group',
  usage: '.antiedit on/off',

  async execute({ reply, jid, args, isOwner, isGroupMsg, db }) {
    const toggle = args[0]?.toLowerCase();

    const currentVal = isGroupMsg
      ? (db.groups.get(jid)?.antiedit ?? db.settings.getValue('antiedit') ?? db.settings.getValue('antiEdit') ?? false)
      : (db.settings.getValue('antiedit') ?? db.settings.getValue('antiEdit') ?? false);

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `✏️ *Anti Edit* is currently *${currentVal ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*.antiedit on*  — Send old version of edited messages to (You) chat\n` +
        `*.antiedit off* — Ignore edited messages\n\n` +
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
        (value ? 'Edited messages will be recovered in your (You) chat.' : 'Edited messages will be ignored.')
      );
    }

    if (!isOwner) return reply('⚠️ Only the bot owner can set global anti-edit from DM.');

    db.settings.setValue('antiedit', value);
    db.settings.setValue('antiEdit', value);
    await saveNow('settings');
    return reply(
      `✏️ *Anti Edit* globally set to *${value ? 'ON ✅' : 'OFF ❌'}*.\n` +
      (value
        ? 'Old versions of edited messages will be sent to your (You) chat.'
        : 'Anti-edit disabled globally.')
    );
  },
};
