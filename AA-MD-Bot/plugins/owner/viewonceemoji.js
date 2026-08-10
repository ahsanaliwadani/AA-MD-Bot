// ============================================
// AA MD Bot - Per-user ViewOnce reveal emoji
// Allows each connected number/user to set ONE emoji that reveals
// a replied view-once message to the bot's "You" chat.
// ============================================

import { saveNow } from '../../lib/database.js';

function emojiSegments(text = '') {
  try {
    const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
    return [...segmenter.segment(text.trim())].map((s) => s.segment).filter(Boolean);
  } catch {
    return [...text.trim()];
  }
}

function looksEmoji(segment = '') {
  if (!segment) return false;
  if (segment.includes('\u20E3')) return true;
  for (const ch of segment) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1f1e0 && cp <= 0x1f1ff) return true;
    if (cp >= 0x1f300) return true;
    if (cp >= 0x2600 && cp <= 0x27bf) return true;
    if (cp >= 0x2300 && cp <= 0x23ff) return true;
  }
  return false;
}

function normalizeOneEmoji(input = '') {
  const segments = emojiSegments(input);
  if (segments.length !== 1 || !looksEmoji(segments[0])) return null;
  return segments[0];
}

function userKey(senderJid = '') {
  return senderJid.split('@')[0].split(':')[0] || 'default';
}

export default {
  command: 'viewonceemoji',
  alias: ['voemoji', 'vvemoji', 'revealemoji', 'setvvemoji'],
  description: 'Set your one-emoji reply trigger for view-once reveal',
  category: 'owner',
  ownerOnly: true,
  usage: '.vvemoji 😍 | .vvemoji off',

  async execute({ args, reply, db, sessionSettings, senderJid, prefix }) {
    const input = (args[0] || '').trim();
    const key = userKey(senderJid);
    const map = db.settings.getValue('voRevealEmojis') || {};
    const current = sessionSettings?.get?.('viewOnceRevealEmoji') || map[key] || 'not set';

    if (!input) {
      return reply(
        `👁️ *ViewOnce Reveal Emoji*\n\n` +
        `Current emoji: *${current}*\n\n` +
        `Set only *one emoji* and then reply to any view-once with that emoji.\n` +
        `The media will reveal to your *(You)* chat.\n\n` +
        `📋 *Usage:*\n` +
        `• *${prefix}vvemoji 😍* — set your emoji\n` +
        `• *${prefix}vvemoji off* — remove your emoji\n\n` +
        `Old trigger still works: reply with 4 same emojis.`
      );
    }

    if (['off', 'remove', 'delete', 'reset'].includes(input.toLowerCase())) {
      delete map[key];
      db.settings.setValue('voRevealEmojis', map);
      sessionSettings?.set?.('viewOnceRevealEmoji', null);
      await saveNow('settings').catch(() => {});
      return reply('✅ Your custom ViewOnce reveal emoji has been removed.');
    }

    const emoji = normalizeOneEmoji(input);
    if (!emoji) {
      return reply(
        `❌ Please send exactly *one emoji* only.\n\n` +
        `Example: *${prefix}vvemoji 😍*\n` +
        `Then reply to a view-once message with just: 😍`
      );
    }

    map[key] = emoji;
    db.settings.setValue('voRevealEmojis', map);
    sessionSettings?.set?.('viewOnceRevealEmoji', emoji);
    await saveNow('settings').catch(() => {});

    return reply(
      `✅ *ViewOnce reveal emoji set:* ${emoji}\n\n` +
      `Now reply to any view-once message with *${emoji}* and it will reveal to your *(You)* chat.\n\n` +
      `> 👁️ *AA MD Bot*`
    );
  },
};
