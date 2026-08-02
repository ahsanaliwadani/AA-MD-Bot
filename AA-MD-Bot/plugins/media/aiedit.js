// AA MD Bot — AI Image Editor
// Primary: DC /nanobanana (AI image edit via URL + prompt)
// Fallback: Pollinations.ai image generation from prompt
// Usage: reply to an image OR provide URL + prompt
//   .aiedit make her hair blue
//   .aiedit https://example.com/img.jpg make the background red
import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export default {
  command: 'aiedit',
  alias: ['aiimage', 'editimage', 'imageedit', 'imgai', 'nanobanana'],
  description: 'Edit any image with an AI prompt (reply + describe the change)',
  category: 'media',

  async execute({ sock, msg, jid, react, reply, quoted, args, text, prefix }) {
    await react('⌛');

    try {
      let imageUrl = null;
      let prompt   = text || '';

      // 1. Quoted image — upload to catbox to get public URL
      const quotedImg = quoted?.message?.imageMessage
        || quoted?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      if (quotedImg) {
        const buf = await downloadMediaMessage(
          { message: { imageMessage: quotedImg }, key: quoted.key },
          'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
        ).catch(() => null);
        if (buf) {
          const { default: FormData } = await import('form-data');
          const form = new FormData();
          form.append('reqtype', 'fileupload');
          form.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
          const res = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(), timeout: 30000,
          });
          imageUrl = res.data?.trim();
        }
      }

      // 2. First arg is a URL — extract URL then rest is prompt
      if (!imageUrl && args[0]?.startsWith('http')) {
        imageUrl = args[0];
        prompt   = args.slice(1).join(' ').trim();
      }

      if (!imageUrl || !prompt) {
        await react('❌');
        return reply(
          `🎨 *AI Image Editor*\n\n` +
          `*Usage:*\n` +
          `• Reply to an image with a description:\n` +
          `  _${prefix}aiedit make her hair blue_\n\n` +
          `• Or provide URL + prompt:\n` +
          `  _${prefix}aiedit <image-url> make background red_\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      }

      await reply(`🎨 _Editing image with AI…_`);

      // ── Try 1: DC nanobanana ──────────────────────────────────────────────────
      let resultUrl = null;
      try {
        const { data } = await axios.get(`${DC}/nanobanana`, {
          params:  { url: imageUrl, prompt },
          headers: { 'User-Agent': UA },
          timeout: 60000,
        });
        if (data?.success !== false) {
          const d = data?.result || data;
          resultUrl = d?.image || d?.url || d?.output || d?.result;
        }
      } catch {}

      // ── Try 2: Pollinations.ai generate from prompt (creative fallback) ──────
      if (!resultUrl) {
        const polPrompt = encodeURIComponent(
          `High quality photorealistic image: ${prompt}. Inspired by the reference photo at: ${imageUrl}`
        );
        const polUrl = `https://image.pollinations.ai/prompt/${polPrompt}?width=768&height=768&model=flux&nologo=true&enhance=true`;
        // Verify it returns an image
        try {
          const check = await axios.head(polUrl, { timeout: 10000 });
          if (check.status === 200) resultUrl = polUrl;
        } catch {}
      }

      if (!resultUrl) throw new Error('All AI image edit APIs failed. Try again in a moment.');

      await sock.sendMessage(jid, {
        image:   { url: resultUrl },
        caption: `🎨 *AI Edited*\n📝 _${prompt}_\n\n> 🤖 *AA MD Bot*`,
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *AI Edit Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
