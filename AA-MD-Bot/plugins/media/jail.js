// ============================================
// AA MD Bot — Jail Canvas Effect
// Primary:  DC API /canvas/jail (when working)
// Fallback: Local sharp SVG composite (always works)
// Usage: reply/tag a user, or send .jail <image-url>
// ============================================
import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function getProfilePicUrl(sock, jid) {
  try { return await sock.profilePictureUrl(jid, 'image'); } catch { return null; }
}

// ── Local jail effect using sharp SVG composite ───────────────────────────────
function makeJailSvg(w, h) {
  const barCount = 7;
  const barW     = Math.max(4, Math.round(w / (barCount * 3.5)));
  const spacing  = Math.round(w / barCount);

  let bars = `<rect width="${w}" height="${h}" fill="rgba(0,0,0,0.30)"/>`;

  for (let i = 0; i < barCount; i++) {
    const x = Math.round(i * spacing + spacing / 2 - barW / 2);
    // Main bar (dark)
    bars += `<rect x="${x}" y="0" width="${barW}" height="${h}" fill="#333" rx="3" opacity="0.92"/>`;
    // Highlight stripe (3D effect)
    bars += `<rect x="${x + 1}" y="0" width="${Math.max(1, Math.floor(barW / 3))}" height="${h}" fill="#777" rx="2" opacity="0.55"/>`;
  }

  // Horizontal cross-bars
  for (const pct of [0.12, 0.5, 0.88]) {
    const y  = Math.round(h * pct);
    const bh = Math.max(4, Math.round(h / 22));
    bars += `<rect x="0" y="${y}" width="${w}" height="${bh}" fill="#2a2a2a" opacity="0.88"/>`;
    bars += `<rect x="0" y="${y + 1}" width="${w}" height="${Math.max(1, Math.floor(bh / 3))}" fill="#555" opacity="0.45"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${bars}</svg>`;
}

async function applyJailLocal(imageBuffer) {
  const { default: sharp } = await import('sharp');
  const meta = await sharp(imageBuffer).metadata();
  const w    = meta.width  || 512;
  const h    = meta.height || 512;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(makeJailSvg(w, h)), blend: 'over' }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

export default {
  command: 'jail',
  alias: ['injail', 'prison'],
  description: 'Put someone behind bars (reply, tag, or provide image URL)',
  category: 'media',

  async execute({ sock, msg, jid, react, reply, quoted, senderJid, args, text, config }) {
    await react('⌛');

    try {
      let imageUrl    = null;
      let imageBuffer = null;

      // 1. Quoted image message — download as buffer
      if (quoted?.message?.imageMessage) {
        imageBuffer = await downloadMediaMessage(
          { message: { imageMessage: quoted.message.imageMessage }, key: quoted.key },
          'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
        ).catch(() => null);
      }

      // 2. Direct image URL in args
      if (!imageBuffer && args[0]?.startsWith('http')) {
        imageUrl = args[0];
      }

      // 3. Tagged mention → profile picture
      if (!imageBuffer && !imageUrl) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const targetJid = quoted?.key?.participant || quoted?.key?.remoteJid || mentioned[0] || senderJid;
        imageUrl = await getProfilePicUrl(sock, targetJid);
      }

      if (!imageBuffer && !imageUrl) {
        await react('❌');
        return reply(
          `🔒 *Jail Effect*\n\n` +
          `*Usage:*\n` +
          `• Reply to an image\n` +
          `• Tag someone: .jail @user\n` +
          `• Provide URL: .jail <image-url>\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      }

      // If we only have a URL, download it first for the local fallback
      if (!imageBuffer && imageUrl) {
        try {
          const res = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA },
            timeout: 20000,
          });
          imageBuffer = Buffer.from(res.data);
        } catch {}
      }

      let resultBuf = null;

      // Try DC API first (faster when it works), pass a public URL
      if (imageUrl || imageBuffer) {
        const pubUrl = imageUrl; // DC needs a public URL
        if (pubUrl) {
          try {
            const { data } = await axios.get(`${DC}/canvas/jail`, {
              params:       { image: pubUrl },
              responseType: 'arraybuffer',
              headers:      { 'User-Agent': UA },
              timeout:      15000,
            });
            const buf = Buffer.from(data);
            // Make sure it's a real image (not an error JSON)
            if (buf.length > 5000 && (buf[0] === 0xff || buf[0] === 0x89 || buf[0] === 0x47)) {
              resultBuf = buf;
            }
          } catch {}
        }
      }

      // Local fallback — always available
      if (!resultBuf && imageBuffer) {
        resultBuf = await applyJailLocal(imageBuffer);
      }

      if (!resultBuf) throw new Error('Could not generate jail effect');

      await sock.sendMessage(jid, {
        image:   resultBuf,
        caption: `🔒 *Behind Bars!*\n\n> 🤖 *${config?.botName || 'AA MD Bot'}*`,
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *Jail effect failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
