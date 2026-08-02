// ============================================
// AA MD Bot - Background Remover
// Primary:  Local sharp flood-fill (always works, solid/simple backgrounds)
// Fallback: Remote API chain (nexray, keith)
// Accepts: reply to image OR send image with caption
// ============================================

import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { uploadToCatbox } from '../../lib/imageUpload.js';

function getImageMsg(msg) {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (quoted?.imageMessage)       return { content: quoted,      quoted, ctx };
  if (msg.message?.imageMessage)  return { content: msg.message, quoted: null, ctx: null };
  return null;
}

// ── Local flood-fill background remover using sharp raw pixels ────────────────
// Works well for solid-color backgrounds (white, black, studio shots).
// For complex real-world backgrounds, use an external AI API.
async function removeBgLocal(imageBuffer) {
  const { default: sharp } = await import('sharp');

  // Resize for performance while keeping enough detail
  const resized = await sharp(imageBuffer)
    .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  const { data, info } = await sharp(resized)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const CH = 4; // RGBA

  // Sample background color from corner clusters
  const samples = [];
  const margin  = 4;
  for (let dy = 0; dy < margin; dy++) {
    for (let dx = 0; dx < margin; dx++) {
      for (const [cx, cy] of [
        [dx, dy], [width - 1 - dx, dy],
        [dx, height - 1 - dy], [width - 1 - dx, height - 1 - dy],
      ]) {
        if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
          const i = (cy * width + cx) * CH;
          samples.push([data[i], data[i + 1], data[i + 2]]);
        }
      }
    }
  }
  const bgR = Math.round(samples.reduce((a, s) => a + s[0], 0) / samples.length);
  const bgG = Math.round(samples.reduce((a, s) => a + s[1], 0) / samples.length);
  const bgB = Math.round(samples.reduce((a, s) => a + s[2], 0) / samples.length);

  // Flood-fill from all 4 edges with color-distance threshold
  const THRESHOLD = 38;
  const pixCount  = width * height;
  const visited   = new Uint8Array(pixCount);
  const toRemove  = new Uint8Array(pixCount);
  const queue     = [];

  function colorDist(pi) {
    const i = pi * CH;
    return Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
  }

  function enqueue(pi) {
    if (!visited[pi]) {
      visited[pi] = 1;
      if (colorDist(pi) < THRESHOLD * 3) { toRemove[pi] = 1; queue.push(pi); }
    }
  }

  // Seed edges
  for (let x = 0; x < width; x++) {
    enqueue(x);                             // top row
    enqueue((height - 1) * width + x);     // bottom row
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);                     // left col
    enqueue(y * width + width - 1);        // right col
  }

  // BFS
  while (queue.length > 0) {
    const pi = queue.pop();
    const x  = pi % width;
    const y  = Math.floor(pi / width);
    if (x > 0)          enqueue(pi - 1);
    if (x < width - 1)  enqueue(pi + 1);
    if (y > 0)          enqueue(pi - width);
    if (y < height - 1) enqueue(pi + width);
  }

  // Set transparent
  for (let pi = 0; pi < pixCount; pi++) {
    if (toRemove[pi]) data[pi * CH + 3] = 0;
  }

  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

// ── Remote API fallback chain ──────────────────────────────────────────────────
async function removeBgRemote(imageUrl) {
  const apis = [
    async () => {
      const res = await axios.get(
        `https://api.nexray.eu.cc/tools/removebg?url=${encodeURIComponent(imageUrl)}`,
        { timeout: 40000, responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const buf = Buffer.from(res.data);
      if (buf.length > 5000 && buf[0] === 0x89 && buf[1] === 0x50) return buf;
      throw new Error('not a PNG');
    },
    async () => {
      const res = await axios.get(
        `https://apis-keith.vercel.app/tools/removebg?url=${encodeURIComponent(imageUrl)}`,
        { timeout: 40000, responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const buf = Buffer.from(res.data);
      if (buf.length > 5000 && (buf[0] === 0x89 || buf[0] === 0xff)) return buf;
      throw new Error('not a valid image');
    },
  ];
  for (const fn of apis) {
    try { const r = await fn(); if (r) return r; } catch {}
  }
  return null;
}

export default {
  command: 'rembg',
  alias: ['removebg', 'nobg', 'bgremove', 'transparent'],
  description: 'Remove image background (solid backgrounds) or AI-powered via remote API',
  category: 'media',

  async execute({ sock, jid, msg, reply, react }) {
    const found = getImageMsg(msg);
    if (!found) return reply(
      `✂️ *Background Remover*\n\n` +
      `*Reply* to an image or *send an image* with *.rembg* as caption.\n\n` +
      `💡 Works best with solid-color backgrounds (white, studio shots).\n\n` +
      `> 🤖 *AA MD Bot*`
    );

    await react('⏳');

    try {
      const { content, quoted, ctx } = found;
      const msgObj = quoted
        ? { message: content, key: { ...msg.key, id: ctx.stanzaId } }
        : msg;

      const buffer = await downloadMediaMessage(
        msgObj, 'buffer', {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      if (!buffer?.length) throw new Error('Image download failed');

      // 1. Try local removal first (fast, always available)
      await react('🎨');
      let result = null;
      try {
        result = await removeBgLocal(buffer);
      } catch (localErr) {
        console.warn('[rembg] local failed:', localErr.message);
      }

      // 2. If local result looks too small (likely failed), try remote APIs
      if (!result || result.length < 5000) {
        await react('☁️');
        const imageUrl = await uploadToCatbox(buffer, 'rembg_input.jpg');
        result = await removeBgRemote(imageUrl);
      }

      if (!result) {
        await react('❌');
        return reply(
          `❌ *Background removal failed.*\n\n` +
          `💡 This works best with:\n` +
          `▸ White or solid-color backgrounds\n` +
          `▸ Studio/product photos\n\n` +
          `For complex backgrounds, try: https://remove.bg\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      }

      await sock.sendMessage(jid, {
        image:    result,
        mimetype: 'image/png',
        caption:
          `✂️ *Background Removed!*\n\n` +
          `_💡 Use .sticker to convert to a sticker_\n\n` +
          `> 🤖 *AA MD Bot*`,
      }, { quoted: msg });
      await react('✅');

    } catch (err) {
      await react('❌');
      reply(`❌ *Error:* ${err.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
