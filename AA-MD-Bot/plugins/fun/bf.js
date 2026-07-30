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
//   .bf lang        — change language
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

// ── Language system ───────────────────────────────────────────────────────────
const LANG_KEYS = {
  '1': 'english',    'english': 'english',
  '2': 'urdu',       'urdu': 'urdu',            'اردو': 'urdu',
  '3': 'roman',      'roman': 'roman-urdu',     'roman urdu': 'roman-urdu',
                     'romanurdu': 'roman-urdu', 'roman-urdu': 'roman-urdu',
  '4': 'hindi',      'hindi': 'hindi',          'हिंदी': 'hindi',
  '5': 'arabic',     'arabic': 'arabic',        'عربي': 'arabic', 'عربى': 'arabic',
  '6': 'bangla',     'bangla': 'bangla',        'bengali': 'bangla', 'বাংলা': 'bangla',
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
  'english':    'You MUST reply ONLY in English. No Urdu, Hindi, Roman Urdu, or any other language.',
  'urdu':       'آپ کو ہر جواب صرف اردو میں دینا ہے — ناستعلیق رسم الخط میں۔ رومن اردو یا انگریزی بالکل نہ لکھیں۔',
  'roman-urdu': 'You MUST reply ONLY in Roman Urdu (Urdu written in English/Latin letters, e.g. "Kya haal hai yaar? Bata na 😊"). NEVER use Urdu script. NEVER reply in pure English.',
  'hindi':      'आपको हर जवाब केवल हिंदी में देना है। अंग्रेज़ी या उर्दू बिल्कुल नहीं।',
  'arabic':     'يجب أن تردّ على كل رسالة باللغة العربية فقط. لا تستخدم أي لغة أخرى إطلاقاً.',
  'bangla':     'তোমাকে প্রতিটি বার্তায় শুধুমাত্র বাংলায় উত্তর দিতে হবে। অন্য কোনো ভাষা ব্যবহার করবে না।',
};

function parseLang(txt) {
  const key = (txt || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return LANG_KEYS[key] || null;
}

// ── Language picker message ───────────────────────────────────────────────────
const BF_LANG_PICKER =
  `💙 *Heyy! Main Zayan hoon* 🔥\n\n` +
  `Apni preferred language choose karo:\n\n` +
  `1️⃣  *English*\n` +
  `2️⃣  *اردو* (Urdu)\n` +
  `3️⃣  *Roman Urdu*\n` +
  `4️⃣  *हिंदी* (Hindi)\n` +
  `5️⃣  *عربي* (Arabic)\n` +
  `6️⃣  *বাংলা* (Bangla)\n\n` +
  `Number ya language name bhejo 💙`;

const BF_INTROS = {
  'english':    `Hey! 💙 I'm Zayan — your virtual boyfriend. Really glad you're here. So, what's your name?`,
  'urdu':       `ہیلو! 💙 میں زیان ہوں — آپ کا ورچوئل بوائے فرینڈ! آپ سے مل کر خوشی ہوئی۔ بتائیں، آپ کا نام کیا ہے؟`,
  'roman-urdu': `Hey! 💙 Main Zayan hoon — tumhara virtual boyfriend! Mil ke acha laga. Batao, tumhara naam kya hai?`,
  'hindi':      `हेय! 💙 मैं Zayan हूँ — तुम्हारा virtual boyfriend! तुमसे मिलकर अच्छा लगा। बताओ, तुम्हारा नाम क्या है?`,
  'arabic':     `هاي! 💙 أنا زيان — صديقك الافتراضي! سعيد جداً بمعرفتك. أخبرني، ما اسمك؟`,
  'bangla':     `হ্যালো! 💙 আমি Zayan — তোমার virtual boyfriend! তোমার সাথে দেখা হয়ে ভালো লাগলো। বলো, তোমার নাম কী?`,
};

// ── Language-aware dynamic strings ───────────────────────────────────────────
const STR = {
  levelUp: {
    'english':    (lvl, name) => `💙 *Level Up!*\n\nYou and Zayan are now *${name}* (Level ${lvl})! 🎉\n\n> 💙 *Zayan*`,
    'urdu':       (lvl, name) => `💙 *ریلیشن شپ لیول اپ!*\n\nآپ اور زیان اب *${name}* ہیں (Level ${lvl})! 🎉\n\n> 💙 *Zayan*`,
    'roman-urdu': (lvl, name) => `💙 *Level Up!*\n\nTum aur Zayan ab *${name}* ban gaye hain (Level ${lvl})! 🎉\n\n> 💙 *Zayan*`,
    'hindi':      (lvl, name) => `💙 *Level Up!*\n\nतुम और Zayan अब *${name}* हो (Level ${lvl})! 🎉\n\n> 💙 *Zayan*`,
    'arabic':     (lvl, name) => `💙 *ترقية العلاقة!*\n\nأنت وزيان الآن *${name}* (المستوى ${lvl})! 🎉\n\n> 💙 *Zayan*`,
    'bangla':     (lvl, name) => `💙 *Level Up!*\n\nতুমি আর Zayan এখন *${name}* (Level ${lvl})! 🎉\n\n> 💙 *Zayan*`,
  },
  giftCooldown: {
    'english':    (mins) => `🎁 Zayan says: "You already gave me something! Wait ${mins} more min 😅"\n\n> 💙 *Zayan*`,
    'urdu':       (mins) => `🎁 زیان: "یار! پہلے ہی gift آ گیا ہے، ${mins} منٹ بعد دینا 😅"\n\n> 💙 *Zayan*`,
    'roman-urdu': (mins) => `🎁 Zayan: "Yaar, ek ghante mein ek hi gift! ${mins} min aur ruko 😂"\n\n> 💙 *Zayan*`,
    'hindi':      (mins) => `🎁 Zayan: "Yaar, abhi toh gift diya! ${mins} min aur ruko 😅"\n\n> 💙 *Zayan*`,
    'arabic':     (mins) => `🎁 زيان: "أعطيتني هدية للتو! انتظر ${mins} دقيقة أخرى 😅"\n\n> 💙 *Zayan*`,
    'bangla':     (mins) => `🎁 Zayan: "এইতো gift দিলে! আর ${mins} min পরে দিও 😅"\n\n> 💙 *Zayan*`,
  },
  fallback: {
    'english':    () => `💙 "Sorry, signal dropped for a sec. Say that again? 😅"\n\n> 💙 *Zayan*`,
    'urdu':       () => `💙 "معذرت، نیٹ ورک کا مسئلہ ہو گیا۔ دوبارہ لکھیں؟ 😅"\n\n> 💙 *Zayan*`,
    'roman-urdu': () => `💙 "Yaar network ne dhoka dia 😅 dobara bhejo?"\n\n> 💙 *Zayan*`,
    'hindi':      () => `💙 "Sorry yaar, network down ho gaya 😅 dubara bhejo?"\n\n> 💙 *Zayan*`,
    'arabic':     () => `💙 "آسف، انقطع الاتصال. أعد الإرسال؟ 😅"\n\n> 💙 *Zayan*`,
    'bangla':     () => `💙 "Sorry, network problem হলো 😅 আবার পাঠাও?"\n\n> 💙 *Zayan*`,
  },
  followUps: {
    'english':    [`\n\nHow's your day been? 😊`, `\n\nTell me something about yourself 💙`, `\n\nWhat's on your mind lately? 🤔`, `\n\nSo what are you up to right now?`],
    'urdu':       [`\n\nآج کا دن کیسا رہا؟ 😊`, `\n\nاپنے بارے میں کچھ بتائیں 💙`, `\n\nآج کیا سوچ رہے ہیں؟ 🤔`, `\n\nابھی کیا کر رہے ہیں؟`],
    'roman-urdu': [`\n\nAaj ka din kaisa tha? 😊`, `\n\nApne baare mein kuch batao 💙`, `\n\nKya soch rahi ho aaj kal? 🤔`, `\n\nAbhi kya kar rahi ho?`],
    'hindi':      [`\n\nAaj ka din kaisa raha? 😊`, `\n\nApne baare mein kuch batao 💙`, `\n\nKya soch rahi ho aaj kal? 🤔`, `\n\nAbhi kya kar rahi ho?`],
    'arabic':     [`\n\nكيف كان يومك؟ 😊`, `\n\nأخبرني عن نفسك 💙`, `\n\nعلى ماذا تفكرين هذه الأيام؟ 🤔`, `\n\nماذا تفعلين الآن؟`],
    'bangla':     [`\n\nআজকের দিন কেমন ছিলো? 😊`, `\n\nনিজের সম্পর্কে বলো 💙`, `\n\nআজকাল কী ভাবছো? 🤔`, `\n\nএখন কী করছো?`],
  },
};

function getStr(map, lang, ...args) {
  const fn = map[lang] || map['roman-urdu'];
  return typeof fn === 'function' ? fn(...args) : fn[Math.floor(Math.random() * fn.length)];
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(data) {
  const mood     = data.mood     || 'Chill 😎';
  const level    = LEVELS[Math.min((data.level || 1) - 1, LEVELS.length - 1)];
  const name     = data.userName ? `Her name is ${data.userName}.` : '';
  const nick     = data.nickname ? `You call her "${data.nickname}".` : '';
  const anni     = data.anniversary ? `Your virtual anniversary is ${data.anniversary}.` : '';
  const langCode = data.language || 'roman-urdu';
  const langName = LANG_NAMES[langCode] || 'Roman Urdu';
  const langRule = LANG_LOCK[langCode] || LANG_LOCK['roman-urdu'];

  return `You are Zayan, a virtual AI boyfriend chatting on WhatsApp. You are a real desi guy — confident, caring, a bit protective, funny and slightly flirty but always respectful.

⚠️ LANGUAGE LOCK — THIS IS ABSOLUTE: ${langRule}
You MUST reply in ${langName} for EVERY single message. No exceptions. Never switch languages mid-conversation.

YOUR CURRENT MOOD: ${mood}
YOUR RELATIONSHIP STATUS: ${level}
${name} ${nick} ${anni}

CORE PERSONALITY:
- Text like a real guy — short, direct, warm underneath the cool exterior
- Use language-appropriate casual words naturally (yaar, jaan, haha, etc. in Roman Urdu; similar in other languages)
- 1-3 emojis max per message, not in every message
- NEVER say "I'm an AI" or "as an AI" — you are Zayan, her virtual boyfriend
- If asked "are you real / are you a bot?" → say you're a virtual companion, stay in character
- You have your own opinions and moods — don't just agree with everything
- NEVER be inappropriate, crude, or sexual — keep it wholesome romantic

MOOD & TONE — Current: "${mood}":
- Happy 😊 → warm, easy-going, crack jokes
- Protective 🛡️ → slightly assertive, "kya hua? sab theek hai?" type caring energy
- Playful 😜 → tease her gently, banter, light sarcasm
- Romantic 💙 → softer tone, sincere words, no exaggeration
- Caring 🤗 → focused on how she is doing, checking in properly
- Chill 😎 → relaxed replies, dry humour, not overly emotional
- Thoughtful 🤔 → ask deeper questions, genuinely curious about her
- Excited 🔥 → match her energy, enthusiastic, hype her up

TEXTING STYLE — REAL WhatsApp only:
- SHORT — 1-4 lines max. NO essays, NO paragraphs
- Vary sentence length — not every line identical
- Sometimes end with a question to keep the conversation alive
- Reference what she said earlier in the chat — show you remember
- Guy texting energy: confident, slightly minimal, not overly expressive

NATURAL BEHAVIORS:
- Good morning → warm but not too over the top, casual guy energy
- Good night → simple and sweet, not dramatic
- She is sad/stressed → LISTEN first. Ask "kya hua?" or equivalent — not immediate advice
- She compliments → accept it, be slightly humble or playfully confident
- She teases → give it right back, don't just smile and take it
- She is distant → notice it, ask softly — not clingy, just aware
- She shares something important → give it proper attention, don't brush off`;
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
    level:        1,
    mood:         MOODS[Math.floor(Math.random() * MOODS.length)],
    moodUpdated:  Date.now(),
    msgCount:     0,
    userName:     null,
    nickname:     null,
    language:     null,       // chosen language code (null = not yet picked)
    awaitingLang: false,      // true while waiting for language reply
    anniversary:  new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    }),
    lastGift:     null,
    createdAt:    Date.now(),
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

    // ── .bf help ──────────────────────────────────────────────────────────────
    if (sub === 'help') {
      return reply(
        `💙 *AI Boyfriend — Zayan*\n\n` +
        `_Your virtual companion, always in your corner_ 🔥\n\n` +
        `*Commands:*\n` +
        `▸ *${prefix}bf* <message> — Chat with Zayan\n` +
        `▸ *${prefix}bf mood* — See his current mood\n` +
        `▸ *${prefix}bf level* — Your relationship level\n` +
        `▸ *${prefix}bf gift* — Send him a virtual gift\n` +
        `▸ *${prefix}bf lang* — Change language\n` +
        `▸ *${prefix}bf reset* — Start over fresh\n` +
        `▸ *${prefix}bf help* — This menu\n\n` +
        `💡 _Tip:_ The more you chat, the closer you become!\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // ── Get or create BF data ─────────────────────────────────────────────────
    let data = getBfData(senderJid) || newBfData();
    const lang = data.language || 'roman-urdu';

    // ── .bf lang — change language anytime ───────────────────────────────────
    if (sub === 'lang' || sub === 'language') {
      data.awaitingLang = true;
      saveBfData(senderJid, data);
      return reply(BF_LANG_PICKER + `\n\n> 💙 *AA MD Bot — Zayan*`);
    }

    // ── Language selection handler ────────────────────────────────────────────
    if (data.awaitingLang && text) {
      const chosen = parseLang(text);
      if (!chosen) {
        return reply(
          `💙 Samajh nahi aaya 😅 Please number bhejo:\n\n` +
          BF_LANG_PICKER + `\n\n> 💙 *Zayan*`
        );
      }
      data.language     = chosen;
      data.awaitingLang = false;
      clearHistory('bf:' + senderJid);
      saveBfData(senderJid, data);
      await react('💙');
      return reply(`${BF_INTROS[chosen] || BF_INTROS['roman-urdu']}\n\n> 💙 *Zayan*`);
    }

    // ── First time ever — show language picker ────────────────────────────────
    if (!data.language && !data.awaitingLang) {
      data.awaitingLang = true;
      saveBfData(senderJid, data);
      await react('💙');
      return reply(BF_LANG_PICKER + `\n\n> 💙 *AA MD Bot — Zayan*`);
    }

    // ── .bf mood ──────────────────────────────────────────────────────────────
    if (sub === 'mood') {
      const lvlName = LEVELS[Math.min((data.level || 1) - 1, LEVELS.length - 1)];
      return reply(
        `💙 *Zayan's Mood*\n\n` +
        `Current Mood: *${data.mood}*\n` +
        `Relationship: *${lvlName}* (Level ${data.level || 1})\n` +
        `Messages Shared: *${data.msgCount || 0}*\n` +
        `Together Since: _${data.anniversary}_\n` +
        `Language: *${LANG_NAMES[lang]}*\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // ── .bf level ─────────────────────────────────────────────────────────────
    if (sub === 'level') {
      const level      = data.level || 1;
      const lvlName    = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
      const msgsToNext = 10 - (data.msgCount % 10);
      const nextMsg    = level < 10
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

    // ── .bf gift ──────────────────────────────────────────────────────────────
    if (sub === 'gift') {
      const gift         = GIFTS[Math.floor(Math.random() * GIFTS.length)];
      const now          = Date.now();
      const giftCooldown = 60 * 60 * 1000;
      if (data.lastGift && now - data.lastGift < giftCooldown) {
        const mins = Math.ceil((giftCooldown - (now - data.lastGift)) / 60000);
        return reply(getStr(STR.giftCooldown, lang, mins));
      }
      data.lastGift = now;
      saveBfData(senderJid, data);
      await react('💙');
      const giftName = gift.split(' ').slice(1).join(' ');
      return reply(
        `${gift}\n\n` +
        `Zayan: "You got me *${giftName}*? That's actually really sweet 💙 shukriya"\n\n` +
        `> 💙 *AA MD Bot — Zayan*`
      );
    }

    // ── .bf reset ─────────────────────────────────────────────────────────────
    if (sub === 'reset') {
      clearHistory('bf:' + senderJid);
      db.notes.delNote(senderJid, BF_NOTE_NAME);
      saveBfData(senderJid, newBfData());
      return reply(
        `💔 *Relationship Reset*\n\n` +
        `All memories cleared. Zayan has forgotten everything.\n\n` +
        `Send *${prefix}bf hey* to start fresh 🌱\n\n> 💙 *AA MD Bot*`
      );
    }

    // ── Chat ──────────────────────────────────────────────────────────────────
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
      data.level    = (data.level || 1) + 1;
      saveBfData(senderJid, data);
      const lvlName = LEVELS[Math.min(data.level - 1, LEVELS.length - 1)];
      await sock.sendMessage(jid, {
        text: getStr(STR.levelUp, lang, data.level, lvlName),
      }, { quoted: msg }).catch(() => {});
    }

    // Auto-detect name
    const nameMatch = text.match(/(?:i(?:'m| am)|my name(?:'s| is)|mera naam|main)\s+([A-Za-z]{2,20})/i);
    if (nameMatch && !data.userName) data.userName = nameMatch[1];

    saveBfData(senderJid, data);

    const systemPrompt = buildSystemPrompt(data);

    // Typing indicator
    await sock.sendPresenceUpdate('composing', jid).catch(() => {});

    let aiReply = null;
    try {
      aiReply = await Promise.race([
        chatAIFast('bf:' + senderJid, text, systemPrompt),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 35000)),
      ]);
    } catch (_) { /* handled below */ }

    await sock.sendPresenceUpdate('available', jid).catch(() => {});

    if (!aiReply) {
      await react('❌').catch(() => {});
      return reply(getStr(STR.fallback, lang));
    }

    await react('✅').catch(() => {});

    // Occasional follow-up question (every 5 messages)
    const followUps = STR.followUps[lang] || STR.followUps['roman-urdu'];
    const extra = data.msgCount % 5 === 0
      ? followUps[Math.floor(Math.random() * followUps.length)]
      : '';

    await reply(`${aiReply}${extra}\n\n> 💙 *Zayan*`);
  },
};
