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

  async execute({ command, args, text, reply, prefix }) {
    const t = text || '';

    // ── bubble / circled ────────────────────────────────────────────────────
    if (['bubble', 'circled'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}bubble <text>\nExample: ${prefix}bubble Hello`);
      return reply(`🔵 ${bubbleText(t)}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── spacedtext / letterspace ────────────────────────────────────────────
    if (['spacedtext', 'letterspace'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}spacedtext <text>`);
      return reply(`✏️ ${[...t].join(' ')}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── binary ──────────────────────────────────────────────────────────────
    if (['binary', 'tobinary'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}binary <text>`);
      return reply(`💻 *Text → Binary*\n\n\`${binEncode(t)}\`\n\n> ✏️ *AA MD Bot*`);
    }

    if (['frombinary', 'unbinary'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}frombinary <binary>`);
      try {
        return reply(`💻 *Binary → Text*\n\n${binDecode(t)}\n\n> ✏️ *AA MD Bot*`);
      } catch {
        return reply('❌ Invalid binary input.');
      }
    }

    // ── hex ─────────────────────────────────────────────────────────────────
    if (['tohex'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}tohex <text>`);
      return reply(`🔢 *Text → Hex*\n\n\`${hexEncode(t)}\`\n\n> ✏️ *AA MD Bot*`);
    }

    if (['fromhex', 'unhex'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}fromhex <hex>`);
      try {
        return reply(`🔢 *Hex → Text*\n\n${hexDecode(t)}\n\n> ✏️ *AA MD Bot*`);
      } catch {
        return reply('❌ Invalid hex input.');
      }
    }

    // ── rot13 / caesar ──────────────────────────────────────────────────────
    if (['rot13', 'caesar'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}rot13 <text>`);
      return reply(`🔐 *ROT13*\n\n${rot13(t)}\n\n_Apply again to decode._\n> ✏️ *AA MD Bot*`);
    }

    // ── novowels ────────────────────────────────────────────────────────────
    if (['novowels', 'removevowels'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}novowels <text>`);
      return reply(`🔤 ${t.replace(/[aeiouAEIOU]/g, '')}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── shuffle ─────────────────────────────────────────────────────────────
    if (['shuffle', 'scramble'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}shuffle <text>`);
      return reply(`🔀 ${shuffleStr(t)}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── emojify ─────────────────────────────────────────────────────────────
    if (['emojify', 'textemoji'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}emojify <text>`);
      const out = [...t.toLowerCase()].map(c => EMOJI_ALPHA[c] || c).join(' ');
      return reply(`${out}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── clap ────────────────────────────────────────────────────────────────
    if (['clap', 'clapback'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}clap <text>`);
      return reply(`👏 ${t.split(/\s+/).join(' 👏 ')} 👏\n\n> ✏️ *AA MD Bot*`);
    }

    // ── aesthetic / vaporwave ───────────────────────────────────────────────
    if (['aesthetic', 'vaporwave'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}aesthetic <text>`);
      return reply(`🌊 ${aestheticText(t)}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── zalgo ───────────────────────────────────────────────────────────────
    if (['zalgo', 'creepy'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}zalgo <text>`);
      return reply(`👻 ${zalgoText(t)}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── leet ────────────────────────────────────────────────────────────────
    if (['leet', 'leetspeak', '1337'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}leet <text>`);
      const out = [...t.toLowerCase()].map(c => LEET_MAP[c] || c).join('');
      return reply(`💻 ${out}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── titlecase ───────────────────────────────────────────────────────────
    if (command === 'titlecase') {
      if (!t) return reply(`*Usage:* ${prefix}titlecase <text>`);
      return reply(`📝 ${t.replace(/\b\w/g, c => c.toUpperCase())}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── snakecase ───────────────────────────────────────────────────────────
    if (command === 'snakecase') {
      if (!t) return reply(`*Usage:* ${prefix}snakecase <text>`);
      return reply(`🐍 ${t.toLowerCase().replace(/\s+/g, '_')}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── camelcase ───────────────────────────────────────────────────────────
    if (command === 'camelcase') {
      if (!t) return reply(`*Usage:* ${prefix}camelcase <text>`);
      const words = t.split(/\s+/);
      const out   = words[0].toLowerCase() + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
      return reply(`🐫 ${out}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── piglatin ────────────────────────────────────────────────────────────
    if (command === 'piglatin') {
      if (!t) return reply(`*Usage:* ${prefix}piglatin <text>`);
      const out = t.split(' ').map(toPigLatin).join(' ');
      return reply(`🐷 ${out}\n\n> ✏️ *AA MD Bot*`);
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
