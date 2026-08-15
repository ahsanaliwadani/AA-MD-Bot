// ============================================
// AA MD Bot - Response Tags Toggle (Owner)
// Controls the global View Channel / forwarded tags on bot responses.
// The text watermark stays enabled through the sendMessage wrapper.
// ============================================

import { db } from '../../lib/database.js';

const FOOTER = '\n\n> 🤖 *AA MD Bot*';

export default {
  command: 'responsetags',
  alias: ['tags', 'channeltags', 'viewchanneltag', 'forwardtags'],
  description: 'Toggle View Channel and forwarded tags on bot responses (owner)',
  category: 'owner',
  ownerOnly: true,
  usage: '.responsetags on/off',

  async execute({ reply, args, prefix }) {
    const sub = args[0]?.toLowerCase();
    const current = db.settings.getValue('responseTags') !== false;

    if (!sub || !['on', 'off'].includes(sub)) {
      return reply(
        `🏷️ *Response Tags Control*\n\n` +
        `*Status:* ${current ? 'ON ✅' : 'OFF ❌'}\n\n` +
        `When OFF, bot responses will not carry:\n` +
        `• *View Channel* tag\n` +
        `• *Forwarded many times* tag\n\n` +
        `Watermark/footer stays added on bot text and captions.\n\n` +
        `*Usage:*\n` +
        `• *${prefix}responsetags off*\n` +
        `• *${prefix}responsetags on*` +
        FOOTER,
      );
    }

    const enabled = sub === 'on';
    db.settings.setValue('responseTags', enabled);

    return reply(
      `${enabled ? '✅' : '❌'} *Response Tags ${enabled ? 'Enabled' : 'Disabled'}*\n\n` +
      (enabled
        ? `Bot responses can show *View Channel* and *forwarded* metadata again.`
        : `Bot responses will be sent without *View Channel* and *Forwarded many times* metadata.`) +
      `\n\nWatermark/footer remains enabled.` +
      FOOTER,
    );
  },
};
