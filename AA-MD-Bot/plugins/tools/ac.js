// AA MD Bot — WhatsApp Account Check (.ac)
// Uses sock.onWhatsApp() to check if a number is registered on WhatsApp
// Developer: Ahsan Ali | AA Mods

const FOOTER = '\n\n> 📱 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

function normalise(raw) {
  let n = (raw || '').replace(/[\s\-.()+]/g, '');
  if (n.startsWith('0092')) n = '92' + n.slice(4);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0') && n.length >= 10) n = '92' + n.slice(1);
  else if (n.startsWith('+')) n = n.slice(1);
  return n;
}

function toDisplay(norm) {
  if (norm.startsWith('92') && norm.length === 12) {
    const local = '0' + norm.slice(2);
    return local.slice(0, 4) + '-' + local.slice(4);
  }
  return '+' + norm;
}

export default {
  command: 'ac',
  alias: ['wacheck', 'numcheck', 'checkwa', 'accountcheck', 'isonwa'],
  description: 'Check if a number is registered on WhatsApp',
  category: 'tools',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const input = (text || '').trim();

    if (!input) return reply(
      `📱 *WhatsApp Account Check*\n\n` +
      `*Usage:* ${prefix}ac <number>\n\n` +
      `*Formats accepted:*\n` +
      `▸ \`03001234567\`  _(Pakistan)_\n` +
      `▸ \`+923001234567\`\n` +
      `▸ \`923001234567\`\n` +
      `▸ \`447911123456\`  _(UK)_\n\n` +
      `*Example:*\n▸ \`${prefix}ac 03001234567\`\n\n` +
      `*Check multiple numbers:*\n` +
      `▸ \`${prefix}ac 0300... 0321... 0333...\`` +
      FOOTER
    );

    // Support multiple numbers space-separated
    const rawNums = input.split(/\s+/).filter(Boolean);
    if (rawNums.length > 5) return reply(
      `❌ Max 5 numbers at once.\n\n> 📱 *AA MD Bot*`
    );

    await react('🔍');

    // Normalise all numbers
    const entries = rawNums.map(r => ({ raw: r, norm: normalise(r) }))
      .filter(e => /^[1-9][0-9]{6,14}$/.test(e.norm));

    if (!entries.length) return reply(
      `❌ *Invalid number(s).*\n\nEnter a valid mobile number.\n\n> 📱 *AA MD Bot*`
    );

    try {
      // Baileys onWhatsApp — accepts array of JIDs
      const jids = entries.map(e => e.norm + '@s.whatsapp.net');
      const results = await sock.onWhatsApp(...jids);

      // Build result map: jid → exists
      const resultMap = new Map();
      if (Array.isArray(results)) {
        for (const r of results) {
          const num = (r.jid || '').split('@')[0];
          resultMap.set(num, { exists: r.exists, jid: r.jid });
        }
      }

      let out = `📱 *WhatsApp Account Check*\n${'━'.repeat(26)}\n\n`;

      for (const { raw, norm } of entries) {
        const info    = resultMap.get(norm);
        const display = toDisplay(norm);
        const e164    = '+' + norm;
        const exists  = info?.exists ?? false;

        out += exists
          ? `✅ *${display}*  _(${e164})_\n   └ *Registered on WhatsApp* ✓\n`
          : `❌ *${display}*  _(${e164})_\n   └ Not on WhatsApp\n`;
        out += '\n';
      }

      // If single number & registered — try to show profile picture
      if (entries.length === 1) {
        const { norm } = entries[0];
        const info = resultMap.get(norm);
        if (info?.exists) {
          out += `${'━'.repeat(26)}\n💡 To stalk: try \`${prefix}simowner ${entries[0].raw}\`` + FOOTER;
          const waJid = norm + '@s.whatsapp.net';
          try {
            const ppUrl = await sock.profilePictureUrl(waJid, 'image').catch(() => null);
            if (ppUrl) {
              const { getBuffer } = await import('../../lib/helper.js');
              const imgBuf = await getBuffer(ppUrl).catch(() => null);
              if (imgBuf) {
                await sock.sendMessage(jid, { image: imgBuf, caption: out }, { quoted: msg });
                return await react('✅');
              }
            }
          } catch {}
        } else {
          out += `${'━'.repeat(26)}` + FOOTER;
        }
      } else {
        out += `${'━'.repeat(26)}` + FOOTER;
      }

      await reply(out);
      await react('✅');

    } catch (e) {
      await react('❌');
      reply(`❌ *Check Failed*\n\n${e.message}\n\n> 📱 *AA MD Bot*`);
    }
  },
};
