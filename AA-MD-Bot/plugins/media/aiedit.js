// AA MD Bot — AI Image Editor
// API: DavidCyrilTech /nanobanana?url=<image>&prompt=<instruction>
// Usage: reply to an image OR provide URL + prompt
//   .aiedit make her hair blue
//   .aiedit https://example.com/img.jpg make the background red
import axios from 'axios';

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
      const quotedImg = quoted?.message?.imageMessage || quoted?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      if (quotedImg) {
        const buf = await sock.downloadMediaMessage(quoted).catch(() => null);
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

      const { data } = await axios.get(`${DC}/nanobanana`, {
        params: { url: imageUrl, prompt },
        headers: { 'User-Agent': UA },
        timeout: 60000,
      });

      if (!data?.success && !data?.result && !data?.image && !data?.url) {
        throw new Error(data?.error || data?.message || 'No result from API');
      }

      const d = data?.result || data;
      const resultUrl = d?.image || d?.url || d?.output || d?.result;

      if (!resultUrl) throw new Error('API returned no image URL');

      await sock.sendMessage(jid, {
        image: { url: resultUrl },
        caption: `🎨 *AI Edited*\n📝 _${prompt}_\n\n> 🤖 *AA MD Bot*`,
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *AI Edit Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
