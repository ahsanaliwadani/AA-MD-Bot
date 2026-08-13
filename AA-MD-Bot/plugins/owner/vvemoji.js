// ============================================
// AA MD Bot - ViewOnce Emoji Trigger Settings
// Sets the specific emoji list that reveals view-once media when replied.
// ============================================

import { db, saveNow } from '../../lib/database.js';

function normalizeEmojiKey(emoji) {
  return String(emoji || '').replace(/[\uFE0E\uFE0F]/g, '');
}

function extractEmojis(text = '') {
  const isEmoji = (s) => {
    if (!s) return false;
    const cp = s.codePointAt(0);
    if (s.length >= 2 && s.includes('\u20E3')) return true;
    if (cp >= 0x1f1e0 && cp <= 0x1f1ff) return true;
    if (cp >= 0x1f300) return true;
    if (cp >= 0x2600 && cp <= 0x27bf) return true;
    if (cp >= 0x2300 && cp <= 0x23ff) return true;
    return false;
  };

  const unique = (items) => {
    const seen = new Set();
    const out = [];
    for (const emoji of items) {
      const key = normalizeEmojiKey(emoji);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(emoji);
    }
    return out;
  };

  try {
    const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
    return unique([...segmenter.segment(text)].map((s) => s.segment).filter(isEmoji));
  } catch {
    return unique([...text].filter(isEmoji));
  }
}

export default {
  command: 'vvemoji',
  alias: ['vemoji', 'voemoji', 'setvvemoji'],
  description: 'Set emojis that reveal view-once when you reply with them',
  category: 'owner',
  ownerOnly: true,
  usage: '.vvemoji 👀 🔓 💠 | .vvemoji off | .vvemoji status',

  async execute({ args, text, reply, prefix }) {
    const sub = (args[0] || '').toLowerCase();
    const current = db.settings.getValue('vvEmojiSet') || ['👀', '🔓', '💠'];

    if (!sub || sub === 'status') {
      return reply(
        `👁️ *ViewOnce Emoji Trigger*\n\n` +
        `Status: *${db.settings.getValue('emojiRevealEnabled') !== false ? 'ON ✅' : 'OFF ❌'}*\n` +
        `Current emojis: ${Array.isArray(current) ? current.join(' ') : current}\n\n` +
        `📌 *How to use:*\n` +
        `Reply to any view-once photo/video/audio with one of these emojis.\n` +
        `The bot silently sends the revealed media to your (You) chat, like *.vv* / *.avv*.\n\n` +
        `• *${prefix}vvemoji 👀 🔓 💠* — set emoji list\n` +
        `• *${prefix}vvemoji off* — disable emoji reveal\n` +
        `• *${prefix}vvemoji on* — enable emoji reveal\n\n` +
        `> 👁️ *AA MD Bot*`
      );
    }

    if (sub === 'on' || sub === 'off') {
      const enable = sub === 'on';
      db.settings.setValue('emojiRevealEnabled', enable);
      await saveNow('settings');
      return reply(`${enable ? '✅' : '❌'} *ViewOnce emoji reveal ${enable ? 'enabled' : 'disabled'}.*\n\n> 👁️ *AA MD Bot*`);
    }

    const emojis = extractEmojis(text);
    if (!emojis.length) return reply(`❌ Send at least one emoji. Example: *${prefix}vvemoji 👀 🔓 💠*`);

    db.settings.setValue('vvEmojiSet', emojis.slice(0, 12));
    db.settings.setValue('emojiRevealEnabled', true);
    await saveNow('settings');
    return reply(`✅ *ViewOnce emoji set saved:* ${emojis.slice(0, 12).join(' ')}\n\nReply to a view-once with any saved emoji to reveal it in your (You) chat.\n\n> 👁️ *AA MD Bot*`);
  },
};
