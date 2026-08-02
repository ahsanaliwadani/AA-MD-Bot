// ============================================
// AA MD Bot - ATTP (Animated Text Sticker)
// Local generation: SVG frames → GIF → WebP sticker via sharp + ffmpeg
// External APIs tried first (faster), local is bulletproof fallback
// ============================================

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import config from '../../config.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');

// ── External API chain (fast when live) ──────────────────────────────────────
const ATTP_APIS = [
  (t) => `https://apis-keith.vercel.app/maker/attp?text=${encodeURIComponent(t)}`,
  (t) => `https://api-faa.my.id/faa/attp?text=${encodeURIComponent(t)}`,
];

async function tryExternalApi(text) {
  const { default: axios } = await import('axios');
  for (const makeUrl of ATTP_APIS) {
    try {
      const resp = await axios.get(makeUrl(text), {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxRedirects: 3,
      });
      const ct  = resp.headers['content-type'] || '';
      const buf = Buffer.from(resp.data);
      if (buf.length > 5000 && (ct.includes('gif') || ct.includes('webp') || ct.includes('image'))) {
        const sig = buf.slice(0, 6).toString('ascii');
        if (sig.startsWith('GIF') || sig.startsWith('RIFF') || buf[0] === 0x89) return buf;
      }
    } catch {}
  }
  return null;
}

// ── Local animated sticker generation ────────────────────────────────────────
function makeSvgFrame(text, hue, frameW, frameH, fontSize) {
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const h2 = (hue + 60) % 360;
  const l  = 55 + 10 * Math.sin((hue / 360) * 2 * Math.PI);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frameW}" height="${frameH}">
  <rect width="${frameW}" height="${frameH}" fill="#09090f"/>
  <defs>
    <filter id="g" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <text
    x="${frameW / 2}" y="${frameH / 2 + fontSize * 0.36}"
    text-anchor="middle"
    font-size="${fontSize}"
    font-family="Arial Black, Impact, Arial, sans-serif"
    font-weight="900"
    fill="hsl(${hue},100%,${l}%)"
    stroke="hsl(${h2},100%,80%)"
    stroke-width="1.5"
    filter="url(#g)">${safeText}</text>
</svg>`;
}

async function generateLocalAttp(text) {
  // sharp is confirmed working on this platform (x64 Linux)
  const sharpMod = await import('sharp').catch(e => { throw new Error(`sharp unavailable: ${e.message}`); });
  const sharp = sharpMod.default;

  await fs.ensureDir(TEMP);

  const id    = Date.now();
  const W     = 512;
  const H     = 200;
  const FPS   = 12;
  const TOTAL = 24;
  const fsize = text.length > 22 ? 52 : text.length > 14 ? 64 : 76;

  const framePaths = [];
  try {
    for (let i = 0; i < TOTAL; i++) {
      const hue = Math.round((i / TOTAL) * 360);
      const svg = makeSvgFrame(text, hue, W, H, fsize);
      const fp  = path.join(TEMP, `attp_${id}_${String(i).padStart(3, '0')}.png`);
      await sharp(Buffer.from(svg)).png().toFile(fp);
      framePaths.push(fp);
    }

    const gifPath = path.join(TEMP, `attp_${id}.gif`);
    const pattern = path.join(TEMP, `attp_${id}_%03d.png`);
    await execAsync(
      `ffmpeg -y -framerate ${FPS} -i "${pattern}" ` +
      `-vf "fps=${FPS},scale=${W}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" ` +
      `-loop 0 "${gifPath}" -loglevel error`,
      { timeout: 60000 }
    );

    if (!(await fs.pathExists(gifPath))) return null;
    const buf = await fs.readFile(gifPath);
    return buf.length > 1000 ? buf : null;
  } finally {
    for (const f of framePaths) await fs.remove(f).catch(() => {});
    await fs.remove(path.join(TEMP, `attp_${id}.gif`)).catch(() => {});
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'attp',
  alias: ['animatedtext', 'textsticker', 'ats'],
  description: 'Convert text to an animated neon sticker',
  category: 'media',

  async execute({ text, reply, react, sock, jid, msg }) {
    if (!text) return reply(
      `✨ *Animated Text Sticker*\n\n` +
      `*Usage:* *.attp <your text>*\n` +
      `*Example:* *.attp AA MD Bot*\n\n` +
      `> ✨ *AA MD Bot*`
    );

    if (text.length > 50) return reply('❌ Text too long. Max 50 characters.');

    await react('⏳');

    try {
      // Try fast external APIs first; fall back to reliable local generation
      let gifBuf = await tryExternalApi(text);
      if (!gifBuf) {
        await react('🎨');
        gifBuf = await generateLocalAttp(text);
      }

      if (!gifBuf?.length) {
        await react('❌');
        return reply(`❌ *ATTP failed* — could not generate sticker.\n\n> ✨ *AA MD Bot*`);
      }

      const sticker = new Sticker(gifBuf, {
        pack:       config.botName || 'AA MD Bot',
        author:     config.ownerName || 'AA Mods',
        type:       StickerTypes.FULL,
        categories: ['🤩', '✨'],
        quality:    80,
      });

      const buf = await sticker.toBuffer();
      await sock.sendMessage(jid, { sticker: buf }, { quoted: msg });
      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ ATTP failed: ${e.message}\n\n> ✨ *AA MD Bot*`);
    }
  },
};
