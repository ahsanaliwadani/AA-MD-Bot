// ============================================
// AA MD Bot - Text Manipulation Tools
// Commands: .reverse .upper .lower .count
//   .mock .tiny .fliptext .wordcount
//   .palindrome .anagram .vowelcount
// ============================================

const SMALLCAPS = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
const FLIPMAP   = {a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z','!':'¡','?':'¿','.':'˙'};

async function sendCopyResult(sock, jid, msg, title, result) {
  const body = `${title}

${result}

> ✏️ *AA MD Bot*`;
  const buttonParamsJson = JSON.stringify({ display_text: '📋 Copy Text', copy_code: result });
  const copyButton = { name: 'cta_copy', buttonParamsJson };

  try {
    return await sock.sendMessage(jid, {
      text: body,
      footer: 'Tap below to copy the styled text',
      buttons: [copyButton],
    }, { quoted: msg });
  } catch {
    try {
      return await sock.sendMessage(jid, {
        text: body,
        footer: 'Tap below to copy the styled text',
        interactiveButtons: [copyButton],
      }, { quoted: msg });
    } catch {
      return sock.sendMessage(jid, { text: `${body}

📋 *Copy:* \`${result.replace(/`/g, 'ʼ')}\`` }, { quoted: msg });
    }
  }
}

export default {
  command: 'reverse',
  alias: [
    'upper','uppercase','caps','lower','lowercase',
    'count','charcount','wordcount','repeat','mock','spongebob',
    'tiny','smallcaps','fliptext','upsidedown','striketext',
    'palindrome','ispalindrome','anagram','isanagram',
    'vowelcount','letterfreq','censored',
  ],
  description: 'Text manipulation — reverse, case, count, fun transforms',
  category: 'tools',

  async execute({ command, args, text, reply, prefix, sock, jid, msg }) {
    const t = text || '';

    // ── reverse ────────────────────────────────────────
    if (command === 'reverse') {
      if (!t) return reply(`*Usage:* ${prefix}reverse <text>\n${prefix}reverse Hello World`);
      return sendCopyResult(sock, jid, msg, '🔄 *Reversed*', t.split('').reverse().join(''));
    }

    // ── upper ──────────────────────────────────────────
    if (['upper','uppercase','caps'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}upper <text>`);
      return sendCopyResult(sock, jid, msg, '🔠 *Uppercase*', t.toUpperCase());
    }

    // ── lower ──────────────────────────────────────────
    if (['lower','lowercase'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}lower <text>`);
      return sendCopyResult(sock, jid, msg, '🔡 *Lowercase*', t.toLowerCase());
    }

    // ── count ──────────────────────────────────────────
    if (['count','charcount','wordcount'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}count <text>`);
      const words = t.split(/\s+/).filter(Boolean);
      const vowels = (t.match(/[aeiouAEIOU]/g) || []).length;
      const sentences = (t.match(/[.!?]+/g) || []).length;
      return reply(
        `📊 *Text Stats*\n\n` +
        `• Characters: *${t.length}*\n` +
        `• Characters (no spaces): *${t.replace(/\s/g,'').length}*\n` +
        `• Words: *${words.length}*\n` +
        `• Sentences: *${sentences}*\n` +
        `• Lines: *${t.split('\n').length}*\n` +
        `• Vowels: *${vowels}*\n` +
        `• Spaces: *${(t.match(/ /g)||[]).length}*\n\n` +
        `> ✏️ *AA MD Bot*`
      );
    }

    // ── repeat ─────────────────────────────────────────
    if (command === 'repeat') {
      const n = Math.min(parseInt(args[0]) || 3, 20);
      const txt = args.slice(1).join(' ');
      if (!txt) return reply(`*Usage:* ${prefix}repeat 5 hello`);
      return sendCopyResult(sock, jid, msg, '🔁 *Repeated Text*', Array(n).fill(txt).join('\n'));
    }

    // ── mock / spongebob ───────────────────────────────
    if (['mock','spongebob'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}mock <text>`);
      return sendCopyResult(sock, jid, msg, '🧽 *Mock Text*', t.split('').map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join(''));
    }

    // ── tiny / smallcaps ───────────────────────────────
    if (['tiny','smallcaps'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}tiny <text>`);
      return sendCopyResult(sock, jid, msg, '🔤 *Small Caps*', t.toLowerCase().split('').map(c => SMALLCAPS[c] || c).join(''));
    }

    // ── fliptext / upsidedown ──────────────────────────
    if (['fliptext','upsidedown'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}fliptext <text>`);
      return sendCopyResult(sock, jid, msg, '🙃 *Flip Text*', t.toLowerCase().split('').map(c => FLIPMAP[c] || c).reverse().join(''));
    }

    // ── striketext ─────────────────────────────────────
    if (command === 'striketext') {
      if (!t) return reply(`*Usage:* ${prefix}striketext <text>`);
      return sendCopyResult(sock, jid, msg, '〰️ *Strike Text*', t.split('').join('\u0336') + '\u0336');
    }

    // ── palindrome ─────────────────────────────────────
    if (['palindrome','ispalindrome'].includes(command)) {
      if (!t) return reply(`*Usage:* ${prefix}palindrome <word or phrase>`);
      const clean = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isPalin = clean === clean.split('').reverse().join('');
      return reply(`🔤 _"${t}"_\n\n${isPalin ? '✅ IS a palindrome!' : '❌ is NOT a palindrome.'}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── anagram ────────────────────────────────────────
    if (['anagram','isanagram'].includes(command)) {
      const parts = t.split(/[,|\/]/);
      if (parts.length < 2) return reply(`*Usage:* ${prefix}anagram word1, word2`);
      const sorted = parts.map(w => w.trim().toLowerCase().replace(/\s/g,'').split('').sort().join(''));
      const isAna = sorted[0] === sorted[1];
      return reply(`🔤 _"${parts[0].trim()}"_ and _"${parts[1].trim()}"_\n\n${isAna ? '✅ ARE anagrams!' : '❌ are NOT anagrams.'}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── vowelcount ─────────────────────────────────────
    if (command === 'vowelcount') {
      if (!t) return reply(`*Usage:* ${prefix}vowelcount <text>`);
      const vowels = t.match(/[aeiouAEIOU]/g) || [];
      const cons   = t.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/g) || [];
      return reply(`🔤 *Vowel Count*\n\nText: _${t.slice(0,60)}_\n\nVowels: *${vowels.length}*\nConsonants: *${cons.length}*\n\n> ✏️ *AA MD Bot*`);
    }

    // ── letterfreq ─────────────────────────────────────
    if (command === 'letterfreq') {
      if (!t) return reply(`*Usage:* ${prefix}letterfreq <text>`);
      const freq = {};
      for (const c of t.toLowerCase().replace(/[^a-z]/g,'')) freq[c] = (freq[c]||0)+1;
      const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10);
      return reply(`📊 *Letter Frequency*\n\n${sorted.map(([c,n]) => `${c}: ${n}`).join('  ')}\n\n> ✏️ *AA MD Bot*`);
    }

    // ── censored ───────────────────────────────────────
    if (command === 'censored') {
      if (!t) return reply(`*Usage:* ${prefix}censored <text>`);
      const censored = t.replace(/\b\w+\b/g, w => w[0] + '*'.repeat(Math.max(w.length-2,1)) + (w.length > 1 ? w[w.length-1] : ''));
      return sendCopyResult(sock, jid, msg, '🔒 *Censored Text*', censored);
    }

    // ── help ───────────────────────────────────────────
    reply(
      `✏️ *Text Tools*\n\n` +
      `• ${prefix}reverse <text>\n` +
      `• ${prefix}upper / ${prefix}lower <text>\n` +
      `• ${prefix}count <text>\n` +
      `• ${prefix}repeat 5 <text>\n` +
      `• ${prefix}mock <text> (SpOnGeBoB)\n` +
      `• ${prefix}tiny <text> (ꜱᴍᴀʟʟ ᴄᴀᴘꜱ)\n` +
      `• ${prefix}fliptext <text> (upsidedown)\n` +
      `• ${prefix}striketext <text>\n` +
      `• ${prefix}palindrome <text>\n` +
      `• ${prefix}anagram word1, word2\n` +
      `• ${prefix}vowelcount <text>\n\n` +
      `> ✏️ *AA MD Bot*`
    );
  },
};
