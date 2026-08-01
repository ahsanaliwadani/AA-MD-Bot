// ============================================
// AA MD Bot - Background Remover
// Upload chain: uguu → litterbox → tmpfiles
// (uguu confirmed working with Nexray API; tmpfiles rejected by Nexray)
// Primary:  Nexray API (returns transparent PNG)
// Fallback: Keith API
// Accepts: reply to image OR send image with caption .rembg
// ============================================

import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Upload helpers (Nexray-compatible hosts only) ─────────────────────────────
// NOTE: tmpfiles.org URLs are rejected by Nexray with 400 — do NOT use them here.

async function uploadToUguu(buffer, filename = 'rembg_input.jpg') {
  const form = new FormData();
  form.append('files[]', new Blob([buffer], { type: 'image/jpeg' }), filename);
  const res = await fetch('https://uguu.se/upload.php', {
    method: 'POST',
    body: form,
    headers: { 'User-Agent': 'Mozilla/5.0 AA-MD-Bot' },
    signal: AbortSignal.timeout(25000),
  });
  const j = await res.json();
  const url = j?.files?.[0]?.url;
  if (url && url.startsWith('https')) return url;
  throw new Error('Uguu: ' + JSON.stringify(j?.description || 'unknown'));
}

async function uploadToLitterbox(buffer, filename = 'rembg_input.jpg') {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '1h');
  form.append('fileToUpload', new Blob([buffer], { type: 'image/jpeg' }), filename);
  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  if (text && text.startsWith('https') && !text.toLowerCase().includes('error')) return text.trim();
  throw new Error('Litterbox: ' + text);
}

async function uploadToCatbox(buffer, filename = 'rembg_input.jpg') {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buffer], { type: 'image/jpeg' }), filename);
  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  if (text && text.startsWith('https') && !text.toLowerCase().includes('error')) return text.trim();
  throw new Error('Catbox: ' + text);
}

// Uploads image buffer and returns a public URL Nexray will accept
async function uploadForRembg(buffer) {
  const chains = [
    ['uguu', () => uploadToUguu(buffer)],
    ['litterbox', () => uploadToLitterbox(buffer)],
    ['catbox', () => uploadToCatbox(buffer)],
  ];
  const errors = [];
  for (const [name, fn] of chains) {
    try {
      const url = await fn();
      if (url) return url;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      console.error(`[rembg] upload ${name} failed:`, e.message);
    }
  }
  throw new Error('All upload hosts failed: ' + errors.join(' | '));
}

// ── Remove-bg API fallback chain ──────────────────────────────────────────────
async function removeBgFromUrl(imageUrl) {
  const apis = [
    // 1. Nexray — returns PNG (confirmed working with uguu/litterbox URLs)
    async () => {
      const res = await axios.get(
        `https://api.nexray.eu.cc/tools/removebg?url=${encodeURIComponent(imageUrl)}`,
        { timeout: 50000, responseType: 'arraybuffer', headers: { 'User-Agent': UA } }
      );
      const buf = Buffer.from(res.data);
      if (buf.length > 5000 && buf[0] === 0x89 && buf[1] === 0x50) return buf;
      throw new Error('Not a valid PNG: ' + buf.slice(0, 100).toString());
    },
    // 2. Keith API
    async () => {
      const res = await axios.get(
        `https://apis-keith.vercel.app/tools/removebg?url=${encodeURIComponent(imageUrl)}`,
        { timeout: 50000, responseType: 'arraybuffer', headers: { 'User-Agent': UA } }
      );
      const buf = Buffer.from(res.data);
      if (buf.length > 5000 && (buf[0] === 0x89 || buf[0] === 0xff)) return buf;
      throw new Error('Not a valid image');
    },
  ];

  for (const fn of apis) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      console.error('[rembg] api failed:', e.message);
    }
  }
  return null;
}

// ── Image extraction ──────────────────────────────────────────────────────────
function getImageMsg(msg) {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (quoted?.imageMessage)      return { content: quoted,      quoted, ctx };
  if (msg.message?.imageMessage) return { content: msg.message, quoted: null, ctx: null };
  return null;
}

export default {
  command: 'rembg',
  alias: ['removebg', 'nobg', 'bgremove', 'transparent'],
  description: 'Remove image background using AI',
  category: 'media',

  async execute({ sock, jid, msg, reply, react }) {
    const found = getImageMsg(msg);
    if (!found) return reply(
      `✂️ *Background Remover*\n\n` +
      `*Reply* to an image or *send an image* with *.rembg* as caption.\n\n` +
      `AI removes the background and returns a transparent PNG.\n\n` +
      `> 🤖 *AA MD Bot*`
    );

    await react('⏳');

    try {
      const { content, quoted, ctx } = found;
      const msgObj = quoted
        ? { message: content, key: { ...msg.key, id: ctx.stanzaId } }
        : msg;

      // Download image from WhatsApp
      const buffer = await downloadMediaMessage(
        msgObj, 'buffer', {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      if (!buffer?.length) throw new Error('Image download failed');

      // Upload to a host Nexray accepts (uguu → litterbox → catbox)
      await react('☁️');
      const imageUrl = await uploadForRembg(buffer);

      // Remove background
      await react('🎨');
      const result = await removeBgFromUrl(imageUrl);

      if (!result) {
        await react('❌');
        return reply(
          `❌ *Background removal failed.*\n\n` +
          `The server may be busy. Please try again.\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      }

      await sock.sendMessage(jid, {
        image: result,
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
