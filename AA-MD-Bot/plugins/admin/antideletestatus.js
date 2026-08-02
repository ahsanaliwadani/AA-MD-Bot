// ============================================
// AA MD Bot — Anti Delete Status Plugin
// Developer: Ahsan Ali | AA Mods
// When someone deletes their WhatsApp status (story),
// bot saves it and sends it to owner's self-chat (You)
// ============================================

import { saveNow } from '../../lib/database.js';

export default {
  command:     'antideletestatus',
  alias:       ['antidelstatus', 'saveDeletedStatus', 'statusguard'],
  description: 'Catch deleted WhatsApp statuses → save to (You) chat',
  category:    'admin',
  usage:       '.antideletestatus on/off',

  async execute({ reply, jid, args, isOwner, db, sessionSettings }) {
    const toggle = args[0]?.toLowerCase();

    const currentVal = sessionSettings.get('antiDeleteStatus') ?? db.settings.getValue('antiDeleteStatus') ?? false;

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `🗑️ *Anti Delete Status* is currently *${currentVal ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*.antideletestatus on*  — Save deleted statuses to (You) chat\n` +
        `*.antideletestatus off* — Ignore deleted statuses\n\n` +
        `📌 When someone deletes their WhatsApp status, the bot\n` +
        `   quietly saves the original and sends it to you.`
      );
    }

    if (!isOwner) return reply('⚠️ Only the bot owner can toggle Anti Delete Status.');

    const value = toggle === 'on';
    sessionSettings.set('antiDeleteStatus', value);
    await saveNow('sessionSettings');

    return reply(
      `🗑️ *Anti Delete Status* is now *${value ? 'ON ✅' : 'OFF ❌'}*.\n` +
      (value
        ? 'Deleted statuses will be sent to your (You) chat.'
        : 'Deleted status detection disabled.')
    );
  },
};
