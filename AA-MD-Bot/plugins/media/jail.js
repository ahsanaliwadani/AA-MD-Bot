// AA MD Bot — Jail Canvas Effect
// API: DavidCyrilTech /canvas/jail?image=<url>
// Usage: reply/tag a user, or send .jail <image-url>
import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function getProfilePicUrl(sock, jid) {
  try { return await sock.profilePictureUrl(jid, 'image'); } catch { return null; }
}

export default {
  command: 'jail',
  alias: ['injail', 'prison'],
  description: 'Put someone behind bars (reply, tag, or provide image URL)',
  category: 'media',

  async execute({ sock, msg, jid, react, reply, quoted, senderJid, args, text, config }) {
    await react('⌛');

    try {
      let imageUrl = null;

      // 1. Quoted image message
      if (quoted?.message?.imageMessage) {
        const buf = await downloadMediaMessage(
          { message: { imageMessage: quoted.message.imageMessage }, key: quoted.key },
          'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
        );
        const { default: FormData } = await import('form-data');
        // Upload to catbox for a public URL
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
        const res = await axios.post('https://catbox.moe/user/api.php', form, {
          headers: form.getHeaders(), timeout: 30000,
        });
        imageUrl = res.data?.trim();
      }

      // 2. Direct image URL in args
      if (!imageUrl && args[0]?.startsWith('http')) {
        imageUrl = args[0];
      }

      // 3. Tagged mention → profile picture
      if (!imageUrl) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const targetJid = quoted?.key?.participant || quoted?.key?.remoteJid || mentioned[0] || senderJid;
        imageUrl = await getProfilePicUrl(sock, targetJid);
      }

      if (!imageUrl) {
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

      // Call DavidCyrilTech jail API
      const { data: imgBuf } = await axios.get(`${DC}/canvas/jail`, {
        params: { image: imageUrl },
        responseType: 'arraybuffer',
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      await sock.sendMessage(jid, {
        image: Buffer.from(imgBuf),
        caption: `🔒 *Behind Bars!*\n\n> 🤖 *${config?.botName || 'AA MD Bot'}*`,
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *Jail effect failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
