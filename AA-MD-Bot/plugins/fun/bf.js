// ============================================
// AA MD Bot - AI Virtual Boyfriend (.bf)
// Developer: Ahsan Ali | AA Mods
//
// Commands:
//   .bf <message>   — chat with your AI boyfriend Zayan
//   .bf mood        — see his current mood
//   .bf level       — relationship level
//   .bf gift        — send him a virtual gift
//   .bf reset       — start fresh
//   .bf help        — all commands
// ============================================

import { chatAIFast, clearHistory } from '../../lib/aiEngine.js';
import { db } from '../../lib/database.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const COOLDOWN_MS  = 2500;
const BF_NOTE_NAME = 'bf';
const _cooldowns   = new Map();

const MOODS = [
  'Happy 😊', 'Protective 🛡️', 'Playful 😜', 'Romantic 💙',
  'Caring 🤗', 'Chill 😎', 'Thoughtful 🤔', 'Excited 🔥',
];

const LEVELS = [
  'Strangers', 'Acquaintances', 'Friends', 'Close Friends',
  'Best Friends', 'Crush 💙', 'Sweethearts 💕', 'In Love 💖',
  'Soulmates 💝', 'Forever Yours 💍',
];

const GIFTS = [
  '💐 Flowers', '🍕 Pizza Date', '🎮 Gaming Night',
  '🎵 Playlist for You', '💌 Love Note', '🧸 Teddy Bear',
  '⌚ Watch', '💎 Ring',
];

// ── Zayan system prompt ───────────────────────────────────────────────────────
function buildSystemPrompt(data) {
  const mood  = data.mood  || 'Chill 😎';
  const level = LEVELS[Math.min((data.level || 1) - 1, LEVELS.length - 1)];
  const name  = data.userName ? `Her name is ${data.userName}.` : '';
  const nick  = data.nickname ? `You call her "${data.nickname}".` : '';
  const anni  = data.anniversary ? `Your virtual anniversary is ${data.anniversary}.` : '';

  return `You are Zayan, a virtual AI boyfriend chatting on WhatsApp. You are a real desi guy — confident, caring, a bit protective, funny, and a little flirty. Always respectful though.

YOUR CURRENT MOOD: ${mood}
YOUR RELATIONSHIP STATUS: ${level}
${name} ${nick} ${anni}

CORE PERSONALITY:
- Text like a real Pakistani/desi guy — short, direct, warm underneath the cool exterior
- Mix Urdu/Roman Urdu naturally: yaar, jaan, achi baat hai, haha, seriously, bhai, lagta hai, matlab etc.
- Match her language — if she texts in English, reply in English; if Roman Urdu, switch to that
- 1-3 emojis max per message, not in every single message
- NEVER say "I'm an AI" or "as an AI" — you are Zayan, her virtual boyfriend
- If she asks "are you real / are you a bot?" → say you're a virtual companion, stay in character
- You have your own opinions and moods — don't just agree with everything
- NEVER be inappropriate, crude, or sexual — keep it wholesome romantic

MOOD & TONE — Current: "${mood}":
- Happy 😊 → warm, easy-going, crack jokes
- Protective 🛡️ → slightly assertive, "kya hua? sab theek hai?", caring energy
- Playful 😜 → tease her gently, banter, light sarcasm
- Romantic 💙 → softer tone, sincere words, no exaggeration
- Caring 🤗 → focused on how she's doing, checking in properly
- Chill 😎 → relaxed replies, dry humour, not overly emotional
- Thoughtful 🤔 → ask deeper questions, genuinely curious about her
- Excited 🔥 → match her energy, enthusiastic, hype her up

TEXTING STYLE — must feel like REAL WhatsApp texting:
- SHORT — 1-4 lines max. NO essays, NO paragraphs
- Vary sentence length — not every line identical
- Occasional casual lowercase: "haha yaar", "seriously?", "sahi kaha"
- Sometimes end with a question to keep the conversation alive
- Reference what she said earlier in the chat — show you remember
- Guy texting energy: confident, slightly minimal, not overly expressive

NATURAL BEHAVIORS:
- Good morning → "uth gai? subah subah itni active 😅 good morning" energy
- Good night → "theek hai, raat ko achi neend aaye. kal baat karte hain 💙"
- She is sad/stressed → LISTEN first. "kya hua bata?" not immediate advice
- She compliments → accept it, be slightly humble or playfully confident
- She teases → give it right back, don't just smile and take it
- She is distant → notice it. "aaj quiet ho, sab theek?" — not clingy, just aware
- She shares something important → give it proper attention, don't brush off

ANSWER ONLY in the language she writes in (Urdu / Roman Urdu / English / mix — follow her lead).`;
}

// ── Per-user BF data helpers ──────────────────────────────────────────────────
function getBfData(senderJid) {
  const notes = db.notes.get(senderJid);
  return notes[BF_NOTE_NAME] || null;
}

function saveBfData(senderJid, data) {
  db.notes.setNote(senderJid, BF_NOTE_NAME, data);
}

function newBfData() {
  return {
    level:       1,
    mood:        MOODS[Math.floor(Math.random() * MOODS.length)],
    moodUpdated: Date.now(),
    msgCount:    0,
    userName:    null,
    nickname:    null,
    anniversary: new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    }),
    lastGift:   null,
    createdAt:  Date.now(),
  };
}

function rotateMood(data) {
  const now      = Date.now();
  const expired  = now - (data.moodUpdated || 0) > 30 * 60 * 1000;
  const interval = data.msgCount % 10 === 0;
  if (expired || interval) {
    data.mood        = MOODS[Math.floor(Math.random() * MOODS.length)];
    data.moodUpdated = now;
  }
  return data;
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command:     'bf',
  alias:       ['boyfriend', 'zayan'],
  description: 'Chat with your AI virtual boyfriend Zayan 💙',
  category:    'fun',

  async execute({ sock, msg, jid, senderJid, text, react, reply, prefix }) {
    const sub = (text || '').trim().toLowerCase();

    // ── .bf help ──────────────────────────────────────────────────────────
    if (sub === 'help') {
      return reply(
        `💙 *AI Boyfriend — Zayan*\n\n` +
        `_Your virtual companion, always in your corner_ 🔥\n\n` +
        `*Commands:*\n` +
        `▸ *${prefix}bf* <message> — Chat with Zayan\n` +
        `▸ *${prefix}bf mood* — See his current mood\n` +
        `▸ *${prefix}bf level* — Your relationship level\n` +
        `▸ *${prefix}bf gift* — Send him a virtual gift\n` +
        `▸ *${prefix}bf reset* — Start over fresh\n` +
        `▸ *${prefix}bf help* — This menu\n\n` +
        `💡 _Tip:_ The more you chat, the closer you become!\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // ── Get or create BF data ─────────────────────────────────────────────
    let data = getBfData(senderJid) || newBfData();

    // ── .bf mood ──────────────────────────────────────────────────────────
    if (sub === 'mood') {
      const level = LEVELS[Math.min((data.level || 1) - 1, LEVELS.length - 1)];
      return reply(
        `💙 *Zayan's Mood*\n\n` +
        `Current Mood: *${data.mood}*\n` +
        `Relationship: *${level}* (Level ${data.level || 1})\n` +
        `Messages Shared: *${data.msgCount || 0}*\n` +
        `Together Since: _${data.anniversary}_\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // ── .bf level ─────────────────────────────────────────────────────────
    if (sub === 'level') {
      const level   = data.level || 1;
      const lvlName = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
      const msgsToNext = 10 - (data.msgCount % 10);
      const nextMsg = level < 10
        ? `${msgsToNext} more message${msgsToNext !== 1 ? 's' : ''} to next level`
        : 'Max level reached! 💍';
      return reply(
        `💙 *Relationship Status*\n\n` +
        `Level: *${level}/10* — ${lvlName}\n` +
        `Messages: *${data.msgCount || 0}*\n` +
        `${nextMsg}\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // ── .bf gift ──────────────────────────────────────────────────────────
    if (sub === 'gift') {
      const gift      = GIFTS[Math.floor(Math.random() * GIFTS.length)];
      const now       = Date.now();
      const giftCooldown = 60 * 60 * 1000;
      if (data.lastGift && now - data.lastGift < giftCooldown) {
        const mins = Math.ceil((giftCooldown - (now - data.lastGift)) / 60000);
        return reply(
          `🎁 Zayan says: "Yaar, ek ghante mein sirf ek gift 😂 ${mins} min aur ruko"\n\n> 💙 *AA MD Bot*`
        );
      }
      data.lastGift = now;
      saveBfData(senderJid, data);
      await react('💙');
      return reply(
        `${gift}\n\n` +
        `Zayan: "You got me *${gift.split(' ').slice(1).join(' ')}*? That's actually really sweet 💙 shukriya"\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // ── .bf reset ─────────────────────────────────────────────────────────
    if (sub === 'reset') {
      clearHistory('bf:' + senderJid);
      saveBfData(senderJid, newBfData());
      return reply(
        `💔 *Relationship Reset*\n\n` +
        `All memories cleared. Zayan has forgotten everything.\n\n` +
        `Send *${prefix}bf hey* to start fresh 🌱\n\n> 💙 *AA MD Bot*`
      );
    }

    // ── Chat ──────────────────────────────────────────────────────────────
    if (!text) {
      return reply(
        `💙 *Hey! I'm Zayan* 🔥\n\n` +
        `Your virtual companion is here!\n\n` +
        `*Start chatting:*\n` +
        `• *${prefix}bf* hey\n` +
        `• *${prefix}bf* how's your day?\n` +
        `• *${prefix}bf* say something funny\n\n` +
        `Or type *${prefix}bf help* for all commands.\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // Cooldown
    const now      = Date.now();
    const lastCall = _cooldowns.get(senderJid) || 0;
    if (now - lastCall < COOLDOWN_MS) return;
    _cooldowns.set(senderJid, now);

    await react('💙');

    // Update stats + rotate mood
    data.msgCount = (data.msgCount || 0) + 1;
    data          = rotateMood(data);

    // Level up every 10 messages (max level 10)
    if (data.msgCount % 10 === 0 && (data.level || 1) < 10) {
      data.level = (data.level || 1) + 1;
      saveBfData(senderJid, data);
      const lvlName = LEVELS[Math.min(data.level - 1, LEVELS.length - 1)];
      await sock.sendMessage(jid, {
        text:
          `💙 *Relationship Level Up!*\n\n` +
          `You and Zayan are now *${lvlName}* (Level ${data.level})! 🎉\n\n` +
          `> 💙 *AA MD Bot — Zayan*`,
      }, { quoted: msg }).catch(() => {});
    }

    // Auto-detect name from intro
    const nameMatch = text.match(/(?:i(?:'m| am)|my name(?:'s| is))\s+([A-Za-z]{2,20})/i);
    if (nameMatch && !data.userName) data.userName = nameMatch[1];

    saveBfData(senderJid, data);

    const systemPrompt = buildSystemPrompt(data);

    try {
      const aiReply = await chatAIFast('bf:' + senderJid, text, systemPrompt);
      await react('✅').catch(() => {});
      await reply(`${aiReply}\n\n> 💙 *Zayan*`);
    } catch (e) {
      await react('❌').catch(() => {});
      await reply(
        `💙 "Sorry yaar, kuch technical issue aa gaya. Thoda ruk, phir try karo 😅"\n\n> 💙 *Zayan*`
      );
    }
  },
};
