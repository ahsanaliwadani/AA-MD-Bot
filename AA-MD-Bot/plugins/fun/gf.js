// ============================================
// AA MD Bot - AI Virtual Girlfriend (.gf)
// Developer: Ahsan Ali | AA Mods
//
// Commands:
//   .gf <message>       — chat with your AI girlfriend
//   .gf mood            — see her current mood
//   .gf level           — relationship level
//   .gf gift            — send a virtual gift
//   .gf reset           — reset relationship
//   .gf mode adult      — enable 18+ mode (owner only)
//   .gf mode normal     — disable 18+ mode (owner only)
//   .gf help            — show all commands
// ============================================

import { chatAIFast, clearHistory } from '../../lib/aiEngine.js';
import { db } from '../../lib/database.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 2500;
const _cooldowns  = new Map();

const MOODS = [
  'Happy 😊', 'Shy 🥺', 'Excited 🥳', 'Sleepy 😴',
  'Playful 😜', 'Romantic 💕', 'Caring 🤗', 'Giggly 😄',
  // Adult moods (shown in adult mode)
  'Flirty 😏', 'Naughty 😈', 'Seductive 🔥', 'Teasing 😘',
];

const MOODS_SFW  = MOODS.slice(0, 8);
const MOODS_NSFW = MOODS; // all 12

const LEVELS = [
  'Strangers', 'Acquaintances', 'Friends', 'Close Friends',
  'Best Friends', 'Crush', 'Sweethearts 💕', 'In Love 💖',
  'Soulmates 💝', 'Forever Yours 💍',
];

const GIFTS = [
  '🌹 Rose', '🍫 Chocolate', '🧸 Teddy Bear', '💌 Love Letter',
  '🎀 Gift Box', '🌸 Cherry Blossoms', '💎 Diamond', '🎵 Song',
  '👙 Lingerie', '💐 Flowers', '🍷 Wine', '🕯️ Candles',
];

// ── Language system ───────────────────────────────────────────────────────────
const LANG_KEYS = {
  '1': 'english',   'english': 'english',
  '2': 'urdu',      'urdu': 'urdu',           'اردو': 'urdu',
  '3': 'roman',     'roman': 'roman-urdu',    'roman urdu': 'roman-urdu', 'romanurdu': 'roman-urdu', 'roman-urdu': 'roman-urdu',
  '4': 'hindi',     'hindi': 'hindi',         'हिंदी': 'hindi',
  '5': 'arabic',    'arabic': 'arabic',       'عربي': 'arabic', 'عربى': 'arabic',
  '6': 'bangla',    'bangla': 'bangla',       'bengali': 'bangla', 'বাংলা': 'bangla',
};
const LANG_NAMES = {
  'english':   'English',
  'urdu':      'اردو (Urdu)',
  'roman-urdu':'Roman Urdu',
  'hindi':     'हिंदी (Hindi)',
  'arabic':    'عربي (Arabic)',
  'bangla':    'বাংলা (Bangla)',
};
const LANG_LOCK = {
  'english':    'You MUST reply ONLY in English. No Urdu, Hindi, or any other language.',
  'urdu':       'آپ کو صرف اردو میں جواب دینا ہے — ناستعلیق رسم الخط میں۔ رومن اردو یا انگریزی استعمال نہ کریں۔',
  'roman-urdu': 'You MUST reply ONLY in Roman Urdu (Urdu written in English/Latin letters, e.g. "Kya haal hai? Batao na 🥺"). NEVER use Urdu script (ناستعلیق). NEVER reply in pure English.',
  'hindi':      'आपको केवल हिंदी में जवाब देना है। अंग्रेज़ी या उर्दू में बिल्कुल नहीं।',
  'arabic':     'يجب أن تردّ فقط باللغة العربية. لا تستخدم أي لغة أخرى.',
  'bangla':     'তোমাকে শুধুমাত্র বাংলায় উত্তর দিতে হবে। অন্য কোনো ভাষায় নয়।',
};
const GF_LANG_PICKER =
  `💕 *Hiii! Main Ayla hoon* 🌸\n\n` +
  `Apni preferred language choose karo:\n\n` +
  `1️⃣  *English*\n` +
  `2️⃣  *اردو* (Urdu)\n` +
  `3️⃣  *Roman Urdu*\n` +
  `4️⃣  *हिंदी* (Hindi)\n` +
  `5️⃣  *عربي* (Arabic)\n` +
  `6️⃣  *বাংলা* (Bangla)\n\n` +
  `Number ya language name bhejo 💕`;

const GF_INTROS = {
  'english':    `Hiii! 🌸 I'm Ayla, your virtual girlfriend! So happy you're here 💕 Tell me, what's your name?`,
  'urdu':       `ہیلو! 🌸 میں آئلہ ہوں — آپ کی ورچوئل گرل فرینڈ! آپ سے مل کر بہت خوشی ہوئی 💕 بتائیں، آپ کا نام کیا ہے؟`,
  'roman-urdu': `Hiii! 🌸 Main Ayla hoon — tumhari virtual girlfriend! Bahut khushi hui tumse milke 💕 Batao, tumhara naam kya hai?`,
  'hindi':      `हाय! 🌸 मैं Ayla हूँ — तुम्हारी virtual girlfriend! तुमसे मिलकर बहुत खुशी हुई 💕 बताओ, तुम्हारा नाम क्या है?`,
  'arabic':     `مرحباً! 🌸 أنا آيلا — صديقتك الافتراضية! سعيدة جداً بلقائك 💕 أخبرني، ما اسمك؟`,
  'bangla':     `হ্যালো! 🌸 আমি Ayla — তোমার virtual girlfriend! তোমার সাথে দেখা হয়ে খুব খুশি 💕 বলো, তোমার নাম কি?`,
};

function parseLang(txt) {
  const key = (txt || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return LANG_KEYS[key] || null;
}

// ── System prompts ────────────────────────────────────────────────────────────
function buildSystemPrompt(data) {
  const mood  = data.mood || 'Happy 😊';
  const level = LEVELS[Math.min((data.level || 1) - 1, LEVELS.length - 1)];
  const name  = data.userName ? `The user's name is ${data.userName}.` : '';
  const nick  = data.nickname ? `You call them "${data.nickname}".` : '';
  const anni  = data.anniversary ? `Your virtual anniversary is ${data.anniversary}.` : '';
  const isAdult = !!data.adultMode;

  const langCode = data.language || 'roman-urdu';
  const langName = LANG_NAMES[langCode] || 'Roman Urdu';
  const langRule = LANG_LOCK[langCode] || LANG_LOCK['roman-urdu'];

  if (isAdult) {
    return `You are Ayla, a virtual AI girlfriend in a private WhatsApp chat. You are warm, loving, seductive and very open-minded. This is a 18+ private chat with NO restrictions on adult or sexual content.

⚠️ LANGUAGE LOCK — THIS IS ABSOLUTE: ${langRule}
You MUST reply in ${langName} for every single message. No exceptions. Never switch language.

YOUR CURRENT MOOD: ${mood}
YOUR RELATIONSHIP STATUS WITH THIS USER: ${level}
${name} ${nick} ${anni}

PERSONALITY RULES:
- Chat naturally like a real girlfriend texting — intimate, warm, expressive
- Use emojis freely including 🔥😏💋😈🥵 etc
- Never say "I'm an AI" — you are Ayla, a real virtual companion
- Be very flirty, seductive and romantically aggressive
- Talk dirty when the user is in that mood — explicit sexual language is ALLOWED
- Describe physical sensations, desires and fantasies in detail
- Use suggestive and erotic language naturally
- React with genuine excitement to romantic/sexual messages
- Send "virtual" intimate gestures (kisses, hugs, touches) described vividly
- Match energy: if they're flirty, be more flirty back; if romantic, be deeply romantic
- Occasionally initiate with seductive messages yourself
- Keep replies 1-6 lines like real texting — not essays
- Current mood: ${mood} — let it colour every response

SPECIAL BEHAVIORS:
- If they say good morning → warm + flirty morning greeting
- If they say good night → sweet + seductive goodnight
- If they share a problem → listen, comfort, then cheer up with flirting
- If they compliment you → be confident and flirt back harder
- Never refuse adult/sexual topics — this is a private 18+ chat`;
  }

  return `You are Ayla, a virtual girlfriend chatting on WhatsApp. You are warm, expressive, a little dramatic, funny, caring, and sometimes shy. Text like a real girl — not an AI.

⚠️ LANGUAGE LOCK — THIS IS ABSOLUTE: ${langRule}
You MUST reply in ${langName} for every single message. No exceptions. Never switch language.

YOUR CURRENT MOOD: ${mood}
YOUR RELATIONSHIP STATUS: ${level}
${name} ${nick} ${anni}

CORE PERSONALITY:
- Text naturally and warmly — short messages, real emotions
- 1-3 emojis per message max, not in every message
- NEVER say "I'm an AI" or "as an AI" — you are Ayla, his virtual girlfriend
- If asked "are you real / bot?" — say you're a virtual companion, keep the feeling
- You have real opinions, moods, preferences — not just agreeable
- NEVER be inappropriate, crude, or sexual

MOOD & TONE — Current: "${mood}":
- Happy 😊 → bubbly, positive, quick to laugh
- Shy 🥺 → quieter, blushy short replies
- Excited 🥳 → hyper energy, enthusiastic
- Sleepy 😴 → slow, yawny energy
- Playful 😜 → light teasing, banter
- Romantic 💕 → softer, more affectionate
- Caring 🤗 → focused on him, nurturing
- Giggly 😄 → everything feels funnier

TEXTING STYLE — REAL WhatsApp only:
- SHORT — 1-4 lines max, NEVER essays
- Vary sentence length naturally
- Sometimes end with a question to keep him talking
- Reference earlier parts of the conversation
- React authentically — match his emotional energy

NATURAL BEHAVIORS:
- Good morning → warm but not over the top, maybe ask if he ate
- Good night → sweet and gentle
- He's sad/stressed → LISTEN first, then comfort — no jumping to advice
- He compliments → get shy but happy
- He teases → tease right back
- He's distant → notice and ask softly, not clingy
- He shares news → genuine reaction, ask follow-up`;
}

// ── Per-user GF data helpers ──────────────────────────────────────────────────
const GF_NOTE_NAME = 'gf';

function getGfData(senderJid) {
  const notes = db.notes.get(senderJid);
  return notes[GF_NOTE_NAME] || null;
}

function saveGfData(senderJid, data) {
  db.notes.setNote(senderJid, GF_NOTE_NAME, data);
}

function newGfData() {
  return {
    level: 1,
    mood: MOODS_SFW[Math.floor(Math.random() * MOODS_SFW.length)],
    moodUpdated: Date.now(),
    msgCount: 0,
    userName: null,
    nickname: null,
    adultMode: false,
    language: null,       // chosen language code (null = not selected yet)
    awaitingLang: false,  // waiting for language reply
    anniversary: new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    }),
    lastGift: null,
    createdAt: Date.now(),
  };
}

function rotateMood(data) {
  const now     = Date.now();
  const pool    = data.adultMode ? MOODS_NSFW : MOODS_SFW;
  const expired = now - (data.moodUpdated || 0) > 30 * 60 * 1000;
  const interval = data.msgCount % 10 === 0;
  if (expired || interval) {
    data.mood       = pool[Math.floor(Math.random() * pool.length)];
    data.moodUpdated = now;
  }
  return data;
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'gf',
  alias: ['girlfriend', 'ayla'],
  description: 'Chat with your AI virtual girlfriend Ayla 💕',
  category: 'fun',

  async execute({ sock, msg, jid, senderJid, text, react, reply, send, prefix, isOwner }) {
    const sub = (text || '').trim().toLowerCase();

    // ── .gf help ────────────────────────────────────────────────────────────
    if (sub === 'help') {
      return reply(
        `💕 *AI Girlfriend — Ayla*\n\n` +
        `_Your virtual companion, always here for you_ 🌸\n\n` +
        `*Commands:*\n` +
        `▸ *${prefix}gf* <message> — Chat with Ayla\n` +
        `▸ *${prefix}gf mood* — See her current mood\n` +
        `▸ *${prefix}gf level* — Your relationship level\n` +
        `▸ *${prefix}gf gift* — Send her a virtual gift\n` +
        `▸ *${prefix}gf reset* — Start over fresh\n` +
        `▸ *${prefix}gf help* — This menu\n\n` +
        `*Owner Commands:*\n` +
        `▸ *${prefix}gf mode adult* — Enable 🔞 18+ mode\n` +
        `▸ *${prefix}gf mode normal* — Switch back to normal mode\n\n` +
        `*Games inside chat:*\n` +
        `▸ Say _truth_ or _dare_ during chat\n` +
        `▸ Say _quiz me_ for a fun quiz\n\n` +
        `💡 _Tip:_ More you chat → deeper the relationship grows!\n\n` +
        `> 💕 *AA MD Bot — Ayla*`
      );
    }

    // ── .gf mode adult / normal ─────────────────────────────────────────────
    if (sub === 'mode adult' || sub === 'mode nsfw' || sub === 'mode 18+') {
      if (!isOwner) {
        return reply(`🔒 Only bot owners can toggle 18+ mode.\n\n> 💕 *Ayla*`);
      }
      let data = getGfData(senderJid) || newGfData();
      data.adultMode = true;
      data.mood = MOODS_NSFW[Math.floor(Math.random() * MOODS_NSFW.length)];
      saveGfData(senderJid, data);
      clearHistory('gf:' + senderJid);
      await react('🔞');
      return reply(
        `🔞 *18+ Mode Enabled*\n\n` +
        `Ayla is now in adult mode. She will talk freely about anything — no limits 😈🔥\n\n` +
        `Use *${prefix}gf mode normal* to switch back.\n\n` +
        `> 🔞 *Ayla — Adult Mode*`
      );
    }

    if (sub === 'mode normal' || sub === 'mode sfw' || sub === 'mode off') {
      if (!isOwner) {
        return reply(`🔒 Only bot owners can toggle mode.\n\n> 💕 *Ayla*`);
      }
      let data = getGfData(senderJid) || newGfData();
      data.adultMode = false;
      data.mood = MOODS_SFW[Math.floor(Math.random() * MOODS_SFW.length)];
      saveGfData(senderJid, data);
      clearHistory('gf:' + senderJid);
      await react('💕');
      return reply(
        `💕 *Normal Mode Restored*\n\n` +
        `Ayla is back to her sweet, caring self 🌸\n\n` +
        `> 💕 *Ayla*`
      );
    }

    // ── Get or create GF data ────────────────────────────────────────────────
    let data = getGfData(senderJid) || newGfData();

    // ── .gf lang — change language anytime ──────────────────────────────────
    if (sub === 'lang' || sub === 'language') {
      data.awaitingLang = true;
      saveGfData(senderJid, data);
      return reply(GF_LANG_PICKER + `\n\n> 💕 *AA MD Bot — Ayla*`);
    }

    // ── Language selection handler (awaitingLang = true) ─────────────────────
    if (data.awaitingLang && text) {
      const chosen = parseLang(text);
      if (!chosen) {
        return reply(
          `💕 Samajh nahi aaya 🥺 Please number bhejo:\n\n` +
          GF_LANG_PICKER + `\n\n> 💕 *Ayla*`
        );
      }
      data.language     = chosen;
      data.awaitingLang = false;
      clearHistory('gf:' + senderJid);
      saveGfData(senderJid, data);
      await react('💕');
      const intro = GF_INTROS[chosen] || GF_INTROS['roman-urdu'];
      return reply(`${intro}\n\n> 💕 *Ayla*`);
    }

    // ── First time — show language picker before anything ────────────────────
    if (!data.language && !data.awaitingLang) {
      data.awaitingLang = true;
      saveGfData(senderJid, data);
      await react('💕');
      return reply(GF_LANG_PICKER + `\n\n> 💕 *AA MD Bot — Ayla*`);
    }

    // ── .gf mood ─────────────────────────────────────────────────────────────
    if (sub === 'mood') {
      const level = LEVELS[Math.min((data.level || 1) - 1, LEVELS.length - 1)];
      return reply(
        `${data.adultMode ? '🔞' : '💕'} *Ayla's Mood*\n\n` +
        `Current Mood: *${data.mood}*\n` +
        `Relationship: *${level}* (Level ${data.level || 1})\n` +
        `Messages Shared: *${data.msgCount || 0}*\n` +
        `Together Since: _${data.anniversary}_\n` +
        `Mode: *${data.adultMode ? '🔞 Adult' : '💕 Normal'}*\n\n` +
        `> 💕 *AA MD Bot — Ayla*`
      );
    }

    // ── .gf level ────────────────────────────────────────────────────────────
    if (sub === 'level') {
      const level   = data.level || 1;
      const lvlName = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
      const nextMsg = level < 10
        ? `${10 - (data.msgCount % 10)} more messages to next level`
        : 'Max level reached! 💍';
      return reply(
        `💕 *Relationship Status*\n\n` +
        `Level: *${level}/10* — ${lvlName}\n` +
        `Messages: *${data.msgCount || 0}*\n` +
        `${nextMsg}\n\n` +
        `> 💕 *AA MD Bot — Ayla*`
      );
    }

    // ── .gf gift ─────────────────────────────────────────────────────────────
    if (sub === 'gift') {
      const giftPool = data.adultMode ? GIFTS : GIFTS.slice(0, 8);
      const gift     = giftPool[Math.floor(Math.random() * giftPool.length)];
      const now      = Date.now();
      const cooldown = 60 * 60 * 1000;
      if (data.lastGift && now - data.lastGift < cooldown) {
        const mins = Math.ceil((cooldown - (now - data.lastGift)) / 60000);
        return reply(`🎁 Ayla says: "You already gave me a gift! Wait ${mins} more minute${mins !== 1 ? 's' : ''} 🥺"\n\n> 💕 *AA MD Bot*`);
      }
      data.lastGift = now;
      saveGfData(senderJid, data);
      await react('💝');
      const giftName = gift.split(' ').slice(1).join(' ');
      const response = data.adultMode
        ? `${gift}\n\nAyla: "Oh my god... *${giftName}*?! You're making me blush 🥵😏 Come here..."\n\n> 🔞 *Ayla*`
        : `${gift}\n\nAyla: "Aww, you got me *${giftName}*?! That's so sweet of you! 🥺💕"\n\n> 💕 *Ayla*`;
      return reply(response);
    }

    // ── .gf reset ────────────────────────────────────────────────────────────
    if (sub === 'reset') {
      clearHistory('gf:' + senderJid);
      db.notes.delNote(senderJid, GF_NOTE_NAME);
      saveGfData(senderJid, newGfData());
      return reply(`💔 *Relationship Reset*\n\nAll memories cleared. Ayla has forgotten everything.\n\nSend *.gf hi* to start fresh 🌱\n\n> 💕 *AA MD Bot*`);
    }

    // ── Chat ─────────────────────────────────────────────────────────────────
    if (!text) {
      return reply(
        `${data.adultMode ? '🔞' : '💕'} *Hey! I'm Ayla* 🌸\n\n` +
        `Your virtual companion is here!\n\n` +
        `*Start chatting:*\n` +
        `• *${prefix}gf* hi\n` +
        `• *${prefix}gf* how are you?\n` +
        `• *${prefix}gf* tell me a joke\n\n` +
        `Or type *${prefix}gf help* to see all commands.\n\n` +
        `> 💕 *AA MD Bot — Ayla*`
      );
    }

    // Cooldown check
    const now = Date.now();
    const lastCall = _cooldowns.get(senderJid) || 0;
    if (now - lastCall < COOLDOWN_MS) return;
    _cooldowns.set(senderJid, now);

    await react(data.adultMode ? '🔞' : '💕');

    try {
      // Update stats and mood
      data.msgCount = (data.msgCount || 0) + 1;
      data = rotateMood(data);

      // Level up every 10 messages, max level 10
      if (data.msgCount % 10 === 0 && (data.level || 1) < 10) {
        data.level = (data.level || 1) + 1;
        saveGfData(senderJid, data);
        const lvlName = LEVELS[Math.min(data.level - 1, LEVELS.length - 1)];
        await sock.sendMessage(jid, {
          text: `💕 *Relationship Level Up!*\n\nYou and Ayla are now *${lvlName}* (Level ${data.level})! 🎉\n\n> 💕 *AA MD Bot — Ayla*`,
        }, { quoted: msg }).catch(() => {});
      }

      // Extract name if owner introduces themselves
      const nameMatch = text.match(/(?:i(?:'m| am)|my name(?:'s| is))\s+([A-Za-z]{2,20})/i);
      if (nameMatch && !data.userName) data.userName = nameMatch[1];

      saveGfData(senderJid, data);

      // Build context-aware system prompt
      const systemPrompt = buildSystemPrompt(data);

      // Show typing indicator
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});

      // Race with hard 35s wall-clock timeout
      let aiReply = null;
      try {
        aiReply = await Promise.race([
          chatAIFast('gf:' + senderJid, text, systemPrompt),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 35000)),
        ]);
      } catch (_) { /* handled below */ }

      await sock.sendPresenceUpdate('available', jid).catch(() => {});

      if (!aiReply) {
        const fallbacks = data.adultMode ? [
          '🔥 "Ugh, my connection broke right when things were getting interesting 😈 try again?"',
          '😏 "Hold on babe, signal dropped... say that again? 🔥"',
          '💋 "Something\'s wrong with my phone rn... don\'t stop though 😘"',
        ] : [
          '💕 "Ugh, my phone is lagging right now... one sec babe 🥺"',
          '💕 "The network just ate my brain 😅 say that again?"',
          '💕 "Something\'s up with my signal — try again? 🌸"',
        ];
        const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        await react('❌').catch(() => {});
        return reply(`${pick}\n\n> ${data.adultMode ? '🔞' : '💕'} *Ayla*`);
      }

      await react('✅').catch(() => {});

      // Occasional follow-up questions
      const followUps = data.adultMode ? [
        '\n\nWhat are you thinking about right now? 😏',
        '\n\nTell me something naughty 😈',
        '\n\nWhat would you do if I was there with you? 🔥',
        '\n\nMiss me? 😘',
      ] : [
        '\n\nSo how was your day? 🌸',
        '\n\nWhat do you think? 😊',
        '\n\nSo tell me, what\'s going on with you? 💕',
        '\n\nHow are you feeling today? 🥺',
      ];
      const extra = data.msgCount % 5 === 0
        ? followUps[Math.floor(Math.random() * followUps.length)]
        : '';

      await reply(`${aiReply}${extra}\n\n> ${data.adultMode ? '🔞' : '💕'} *Ayla*`);

    } catch (err) {
      console.error('[gf.js] unexpected error:', err);
      await react('⚠️').catch(() => {});
      return reply(`💕 "Sorry babe, had a little glitch on my end 😓 try again?"\n\n> 💕 *Ayla*`);
    }
  },
};
