// AA MD Bot — AI Image Editor
// API: DavidCyrilTech /nanobanana?url=<image>&prompt=<instruction>
// Usage: reply to an image OR provide URL + prompt
//   .aiedit make her hair blue
//   .aiedit https://example.com/img.jpg make the background red
import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function uploadToCatbox(buf) {
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  const url = res.data?.trim();
  if (!url || !url.startsWith('http')) throw new Error('Catbox upload returned invalid URL');
  return url;
}

// Some third-party image APIs 412 when the image host doesn't return
// a proper content-type / is unreachable from their server. This
// re-hosts to a second provider as a fallback.
async function uploadFallback(buf) {
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append('file', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  const url = res.data?.data?.url;
  if (!url) throw new Error('Fallback upload returned no URL');
  // tmpfiles gives a viewer link; convert to direct download link
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

async function verifyImageReachable(url) {
  try {
    const res = await axios.head(url, { timeout: 10000, headers: { 'User-Agent': UA } });
    const ctype = res.headers['content-type'] || '';
    return ctype.startsWith('image/');
  } catch {
    return false;
  }
}

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
      let mediaBuf = null;

      // 1. Quoted image
      const quotedImg = quoted?.message?.imageMessage || quoted?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      if (quotedImg) {
        mediaBuf = await downloadMediaMessage(
          { message: { imageMessage: quotedImg }, key: quoted.key },
          'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
        ).catch(() => null);

        if (mediaBuf) {
          try {
            imageUrl = await uploadToCatbox(mediaBuf);
          } catch (err) {
            imageUrl = null;
          }
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

      // 3. Make sure the API can actually fetch this image.
      //    If not reachable (common cause of 412), try re-hosting.
      const reachable = await verifyImageReachable(imageUrl);
      if (!reachable) {
        if (mediaBuf) {
          try {
            imageUrl = await uploadFallback(mediaBuf);
          } catch (err) {
            await react('❌');
            return reply(`❌ *AI Edit Failed*\n\nCouldn't get a publicly reachable image URL (host unreachable / blocked).\n\n> 🤖 *AA MD Bot*`);
          }
        } else {
          await react('❌');
          return reply(`❌ *AI Edit Failed*\n\nThe provided image URL isn't publicly reachable. Try a different link or reply to the image directly.\n\n> 🤖 *AA MD Bot*`);
        }
      }

      await reply(`🎨 _Editing image with AI…_`);

      let data;
      try {
        const res = await axios.get(`${DC}/nanobanana`, {
          params: { url: imageUrl, prompt },
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          timeout: 60000,
          validateStatus: () => true, // let us inspect non-2xx ourselves
        });

        if (res.status === 412) {
          // Surface whatever reason the API gave, or retry once with re-hosted image
          const apiMsg = res.data?.message || res.data?.error || JSON.stringify(res.data);
          if (mediaBuf) {
            const retryUrl = await uploadFallback(mediaBuf).catch(() => null);
            if (retryUrl) {
              const retryRes = await axios.get(`${DC}/nanobanana`, {
                params: { url: retryUrl, prompt },
                headers: { 'User-Agent': UA, Accept: 'application/json' },
                timeout: 60000,
                validateStatus: () => true,
              });
              if (retryRes.status >= 200 && retryRes.status < 300) {
                data = retryRes.data;
              } else {
                throw new Error(`API rejected image (412): ${apiMsg}`);
              }
            } else {
              throw new Error(`API rejected image (412): ${apiMsg}`);
            }
          } else {
            throw new Error(`API rejected image (412): ${apiMsg}`);
          }
        } else if (res.status < 200 || res.status >= 300) {
          const apiMsg = res.data?.message || res.data?.error || `HTTP ${res.status}`;
          throw new Error(apiMsg);
        } else {
          data = res.data;
        }
      } catch (err) {
        // Axios/network-level failure — surface response body if present
        const apiMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        throw new Error(apiMsg);
      }

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
