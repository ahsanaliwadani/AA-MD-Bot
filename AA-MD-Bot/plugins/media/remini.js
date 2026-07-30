// ============================================
// AA MD Bot - Remini AI Image Enhancer
// Primary: sharp local (guaranteed, no upload needed)
// Bonus: API chain if upload works (better quality)
// ============================================

import axios from 'axios';
import sharp from 'sharp';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { uploadImage } from '../../lib/imageUpload.js';

function getImageMsg(msg) {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (quoted?.imageMessage)       return { content: quoted,      quoted, ctx };
  if (msg.message?.imageMessage)  return { content: msg.message, quoted: null, ctx: null };
  return null;
}

// ── Local sharp enhance (PRIMARY — instant, no network, guaranteed) ───────────
async function sharpEnhance(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const w = Math.min((meta.width  || 400) * 2, 3000);
  const h = Math.min((meta.height || 400) * 2, 3000);
  return sharp(imageBuffer)
    .resize(w, h, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.5, m1: 2.0, m2: 0.5 })
    .modulate({ brightness: 1.05, saturation: 1.1 })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

// ── API chain (bonus — only attempted if image upload works) ─────────────────
async function enhanceWithApi(imageUrl) {
  const apis = [
    // davidcyriltech — returns raw JPEG bytes
    async () => {
      const res = await axios.get(
        `https://apis.davidcyriltech.my.id/remini?url=${encodeURIComponent(imageUrl)}`,
        { timeout: 50000, responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const buf = Buffer.from(res.data);
      if (buf.length > 5000 && buf[0] === 0xff && buf[1] === 0xd8) return buf;
      throw new Error('Not a valid JPEG');
    },

    // aiapis.io
    async () => {
      const res = await axios.get(
        `https://aiapis.io/api/remini?url=${encodeURIComponent(imageUrl)}`,
        { timeout: 50000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const url = res.data?.result || res.data?.url || res.data?.image;
      if (!url) throw new Error('No URL');
      const img = await axios.get(url, { timeout: 30000, responseType: 'arraybuffer' });
      const buf = Buffer.from(img.data);
      if (buf.length > 5000) return buf;
      throw new Error('Too small');
    },

    // princetechn
    async () => {
      const res = await axios.get(
        `https://api.princetechn.com/api/tools/remini?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(imageUrl)}`,
        { timeout: 50000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (!res.data?.success) throw new Error(res.data?.message || 'API failure');
      const imgUrl = res.data?.result?.image_url;
      if (!imgUrl) throw new Error('No image URL');
      const img = await axios.get(imgUrl, { timeout: 30000, responseType: 'arraybuffer' });
      const buf = Buffer.from(img.data);
      if (buf.length > 5000) return buf;
      throw new Error('Too small');
    },
  ];

  for (const fn of apis) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
  }
  return null;
}

export default {
  command: 'remini',
  alias: ['hdimage', 'unblur'],
  description: 'Enhance blurry/low-res photos with Remini AI',
  category: 'media',

  async execute({ sock, jid, msg, reply, react }) {
    const found = getImageMsg(msg);
    if (!found) return reply(
      `✨ *Remini AI Enhancer*\n\n` +
      `*Reply* to an image or *send an image* with *.remini* as caption.\n\n` +
      `Sharpens blurry, low-res, or old photos.\n\n` +
      `*Aliases:* .hdimage .unblur\n\n` +
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

      await react('✨');
      let result = null;
      let method = '';

      // ── Step 1: Try DavidCyrilTech Remini API (PRIMARY — best quality) ───────
      try {
        const imageUrl = await Promise.race([
          uploadImage(buffer, 'remini_input.jpg'),
          new Promise((_, r) => setTimeout(() => r(new Error('upload timeout')), 20000)),
        ]);
        const apiBuf = await enhanceWithApi(imageUrl);
        if (apiBuf) {
          result = apiBuf;
          method = '✨ Enhanced (Remini AI)';
        }
      } catch {} // API is optional — fall through to sharp

      // ── Step 2: sharp local enhance (guaranteed fallback) ────────────────────
      if (!result) {
        result = await sharpEnhance(buffer);
        method  = '✨ Enhanced (Local AI)';
      }

      await sock.sendMessage(jid, {
        image: result,
        mimetype: 'image/jpeg',
        caption: `${method}\n\n_Powered by AA MD Bot_\n\n> 🤖 *AA MD Bot*`,
      }, { quoted: msg });
      await react('✅');

    } catch (err) {
      await react('❌');
      reply(`❌ *Error:* ${err.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
