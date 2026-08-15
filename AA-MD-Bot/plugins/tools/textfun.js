// AA MD Bot — Text Fun Tools
// NEW commands not already in texttools.js or textstyle.js
// Commands: bubble, space, binary, hex, rot13, novowels, shuffle,
//           emojify, clap, aesthetic, zalgo, leet, title, snake, camel, pig
import crypto from 'crypto';

const BUBBLE_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const BUBBLE_OUT = [...'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ⓪①②③④⑤⑥⑦⑧⑨'];

const EMOJI_ALPHA = {
  a:'🅰️', b:'🅱️', c:'©️',  d:'🇩', e:'📧', f:'🎏', g:'🇬',
  h:'♓',  i:'ℹ️', j:'🎷', k:'🎋', l:'🕒', m:'Ⓜ️', n:'🇳',
  o:'⭕',  p:'🅿️', q:'🇶', r:'®️', s:'💲', t:'✝️', u:'⛎',
  v:'♈',  w:'〰️', x:'❌', y:'💴', z:'💤', ' ':'  ',
};

const LEET_MAP = { a:'4', e:'3', i:'1', o:'0', s:'5', t:'7', l:'1', g:'9', b:'8' };

const ZALGO_UP   = ['\u0300','\u0301','\u0302','\u0303','\u0304','\u0305','\u0306','\u0307','\u0308','\u0309','\u030A','\u030B','\u030C','\u030D','\u030E','\u030F','\u0310','\u0311','\u0312','\u031A','\u033D','\u033E','\u033F','\u0340','\u0341','\u0342','\u0343','\u0344','\u0346'];
const ZALGO_DOWN = ['\u0316','\u0317','\u0318','\u0319','\u031C','\u031D','\u031E','\u031F','\u0320','\u0321','\u0322','\u0323','\u0324','\u0325','\u0326','\u0327','\u0328','\u0329','\u032A','\u032B'];

function randFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function bubbleText(t) {
  return [...t].map(c => {
    const i = BUBBLE_MAP.indexOf(c);
    return i >= 0 ? BUBBLE_OUT[i] : c;
  }).join('');
}

function zalgoText(t) {
  return [...t].map(c => {
    if (c === ' ') return c;
    let out = c;
    const count = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) out += randFrom(Math.random() < 0.6 ? ZALGO_UP : ZALGO_DOWN);
    return out;
  }).join('');
}

function aestheticText(t) {
  return [...t].map(c => {
    const code = c.charCodeAt(0);
    if (code >= 33 && code <= 126) return String.fromCharCode(code + 0xFEE0);
    if (c === ' ') return '　';
    return c;
  }).join('');
}

function hexEncode(t) { return Buffer.from(t).toString('hex'); }
function hexDecode(t) { return Buffer.from(t, 'hex').toString('utf8'); }
function binEncode(t) { return [...t].map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' '); }
function binDecode(t) { return t.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join(''); }
function rot13(t)     { return t.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13))); }

function shuffleStr(t) {
  const arr = [...t];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function toPigLatin(word) {
  const m = word.match(/^([^aeiouAEIOU]*)(.*)$/);
  return (m?.[2] || word) + (m?.[1] || '') + 'ay';
}

async function sendCopyResult(sock, jid, msg, _title, result) {
  // Text converters should return only the converted text as one clean message.
  // No watermark, no footer/buttons, and no newsletter/View Channel context.
  return sock.sendMessage(jid, { text: result }, { quoted: msg, _noChannelCtx: true });
}

export default {
  command: 'bubble',
  alias: [
    'circled',
    'spacedtext', 'letterspace',
    'binary', 'tobinary', 'frombinary', 'unbinary',
    'tohex', 'fromhex', 'unhex',
    'rot13', 'caesar',
    'novowels', 'removevowels',
    'shuffle', 'scramble',
    'emojify', 'textemoji',
    'clap', 'clapback',
    'aesthetic', 'vaporwave',
    'zalgo', 'creepy',
    'leet', 'leetspeak', '1337',
    'titlecase',
    'snakecase',
    'camelcase',
    'piglatin',
  ],
  description: 'Text fun — bubble, binary, hex, zalgo, leet, aesthetic & more',
  category: 'tools',
  noChannelCtx: true,

  async execute({ command, args, text, reply, prefix, sock, jid, msg }) {
    const t = text || '';

    // ── bubble / circled ────────────────────────────────────────────────────
    if (['bubble', 'circled'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}bubble <text>\nExample: ${prefix}bubble Hello`);
      return sendCopyResult(sock, jid, msg, '🔵 *Bubble Text*', bubbleText(t));
    }

    // ── spacedtext / letterspace ────────────────────────────────────────────
    if (['spacedtext', 'letterspace'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}spacedtext <text>`);
      return sendCopyResult(sock, jid, msg, '✏️ *Spaced Text*', [...t].join(' '));
    }

    // ── binary ──────────────────────────────────────────────────────────────
    if (['binary', 'tobinary'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}binary <text>`);
      return sendCopyResult(sock, jid, msg, '💻 *Text → Binary*', binEncode(t));
    }

    if (['frombinary', 'unbinary'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}frombinary <binary>`);
      try {
        return sendCopyResult(sock, jid, msg, '💻 *Binary → Text*', binDecode(t));
      } catch {
        return reply('❌ Invalid binary input.');
      }
    }

    // ── hex ─────────────────────────────────────────────────────────────────
    if (['tohex'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}tohex <text>`);
      return sendCopyResult(sock, jid, msg, '🔢 *Text → Hex*', hexEncode(t));
    }

    if (['fromhex', 'unhex'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}fromhex <hex>`);
      try {
        return sendCopyResult(sock, jid, msg, '🔢 *Hex → Text*', hexDecode(t));
      } catch {
        return reply('❌ Invalid hex input.');
      }
    }

    // ── rot13 / caesar ──────────────────────────────────────────────────────
    if (['rot13', 'caesar'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}rot13 <text>`);
      return sendCopyResult(sock, jid, msg, '🔐 *ROT13*', rot13(t));
    }

    // ── novowels ────────────────────────────────────────────────────────────
    if (['novowels', 'removevowels'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}novowels <text>`);
      return sendCopyResult(sock, jid, msg, '🔤 *No Vowels*', t.replace(/[aeiouAEIOU]/g, ''));
    }

    // ── shuffle ─────────────────────────────────────────────────────────────
    if (['shuffle', 'scramble'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}shuffle <text>`);
      return sendCopyResult(sock, jid, msg, '🔀 *Shuffled Text*', shuffleStr(t));
    }

    // ── emojify ─────────────────────────────────────────────────────────────
    if (['emojify', 'textemoji'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}emojify <text>`);
      const out = [...t.toLowerCase()].map(c => EMOJI_ALPHA[c] || c).join(' ');
      return sendCopyResult(sock, jid, msg, '😀 *Emojified Text*', out);
    }

    // ── clap ────────────────────────────────────────────────────────────────
    if (['clap', 'clapback'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}clap <text>`);
      return sendCopyResult(sock, jid, msg, '👏 *Clap Text*', `👏 ${t.split(/\s+/).join(' 👏 ')} 👏`);
    }

    // ── aesthetic / vaporwave ───────────────────────────────────────────────
    if (['aesthetic', 'vaporwave'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}aesthetic <text>`);
      return sendCopyResult(sock, jid, msg, '🌊 *Aesthetic Text*', aestheticText(t));
    }

    // ── zalgo ───────────────────────────────────────────────────────────────
    if (['zalgo', 'creepy'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}zalgo <text>`);
      return sendCopyResult(sock, jid, msg, '👻 *Zalgo Text*', zalgoText(t));
    }

    // ── leet ────────────────────────────────────────────────────────────────
    if (['leet', 'leetspeak', '1337'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}leet <text>`);
      const out = [...t.toLowerCase()].map(c => LEET_MAP[c] || c).join('');
      return sendCopyResult(sock, jid, msg, '💻 *Leet Text*', out);
    }

    // ── titlecase ───────────────────────────────────────────────────────────
    if (command === 'titlecase') {
      if (!t) return reply(`*Usage:* ${prefix}titlecase <text>`);
      return sendCopyResult(sock, jid, msg, '📝 *Title Case*', t.replace(/\b\w/g, c => c.toUpperCase()));
    }

    // ── snakecase ───────────────────────────────────────────────────────────
    if (command === 'snakecase') {
      if (!t) return reply(`*Usage:* ${prefix}snakecase <text>`);
      return sendCopyResult(sock, jid, msg, '🐍 *Snake Case*', t.toLowerCase().replace(/\s+/g, '_'));
    }

    // ── camelcase ───────────────────────────────────────────────────────────
    if (command === 'camelcase') {
      if (!t) return reply(`*Usage:* ${prefix}camelcase <text>`);
      const words = t.split(/\s+/);
      const out   = words[0].toLowerCase() + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
      return sendCopyResult(sock, jid, msg, '🐫 *Camel Case*', out);
    }

    // ── piglatin ────────────────────────────────────────────────────────────
    if (command === 'piglatin') {
      if (!t) return reply(`*Usage:* ${prefix}piglatin <text>`);
      const out = t.split(' ').map(toPigLatin).join(' ');
      return sendCopyResult(sock, jid, msg, '🐷 *Pig Latin*', out);
    }

    // ── help ────────────────────────────────────────────────────────────────
    return reply(
      `✨ *Text Fun Commands*\n\n` +
      `• *${prefix}bubble* <text> — Ⓑⓤⓑⓑⓛⓔ letters\n` +
      `• *${prefix}spacedtext* <text> — S p a c e d\n` +
      `• *${prefix}binary* / *${prefix}frombinary* <text>\n` +
      `• *${prefix}tohex* / *${prefix}fromhex* <text>\n` +
      `• *${prefix}rot13* <text> — ROT13 cipher\n` +
      `• *${prefix}novowels* <text> — remove vowels\n` +
      `• *${prefix}shuffle* <text> — scramble letters\n` +
      `• *${prefix}emojify* <text> — 🅰️➡️🅱️ emoji letters\n` +
      `• *${prefix}clap* <text> — add 👏 between words\n` +
      `• *${prefix}aesthetic* <text> — ｖａｐｏｒｗａｖｅ\n` +
      `• *${prefix}zalgo* <text> — ẑ̷a̷l̷g̷o̷ creepy text\n` +
      `• *${prefix}leet* <text> — 1337 5p34k\n` +
      `• *${prefix}titlecase* <text> — Title Case\n` +
      `• *${prefix}snakecase* <text> — snake_case\n` +
      `• *${prefix}camelcase* <text> — camelCase\n` +
      `• *${prefix}piglatin* <text> — Igpay Atinlay\n\n` +
      `> ✏️ *AA MD Bot*`
    );
  },
};
