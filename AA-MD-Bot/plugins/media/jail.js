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

// Extracts the real error message from an Axios error even when
// responseType was 'arraybuffer' (error body comes back as a Buffer).
function extractApiError(err) {
  const resp = err.response;
  if (!resp) return err.message;
  let body = resp.data;
  try {
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* not JSON, leave as string */ }
    }
  } catch { /* ignore */ }
  const msg = body?.message || body?.error || (typeof body === 'string' ? body : null);
  return msg ? `${msg} (HTTP ${resp.status})` : `HTTP ${resp.status}`;
}

async function callJailApi(imageUrl) {
  const res = await axios.get(`${DC}/canvas/jail`, {
    params: { image: imageUrl },
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA },
    timeout: 20000,
    validateStatus: () => true, // inspect status ourselves
  });

  const ctype = res.headers['content-type'] || '';
  if (res.status < 200 || res.status >= 300 || !ctype.startsWith('image/')) {
    // Body is likely JSON error text even though responseType is arraybuffer
    let bodyText = Buffer.from(res.data).toString('utf8');
    let msg = bodyText;
    try {
      const parsed = JSON.parse(bodyText);
      msg = parsed?.message || parsed?.error || bodyText;
    } catch { /* leave as raw text */ }
    const err = new Error(`${msg} (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(res.data);
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
      let mediaBuf = null;

      // 1. Quoted image message
      if (quoted?.message?.imageMessage) {
        mediaBuf = await downloadMediaMessage(
          { message: { imageMessage: quoted.message.imageMessage }, key: quoted.key },
          'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
        ).catch(() => null);

        if (mediaBuf) {
          try {
            imageUrl = await uploadToCatbox(mediaBuf);
          } catch {
            imageUrl = null;
          }
        }
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

      // Verify the image URL is actually reachable / a real image.
      // WhatsApp profile-pic URLs and some catbox links fail this,
      // which is the most common cause of a 412 from the API.
      const reachable = await verifyImageReachable(imageUrl);
      if (!reachable) {
        if (mediaBuf) {
          imageUrl = await uploadFallback(mediaBuf).catch(() => imageUrl);
        } else {
          // Try downloading it ourselves and re-hosting it
          try {
            const dl = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': UA } });
            imageUrl = await uploadFallback(Buffer.from(dl.data));
          } catch {
            // fall through and let the API call attempt/report the real error
          }
        }
      }

      let imgBuf;
      try {
        imgBuf = await callJailApi(imageUrl);
      } catch (err) {
        // One retry with a re-hosted image if we still have the raw buffer
        if (err.status === 412 && mediaBuf) {
          const retryUrl = await uploadFallback(mediaBuf).catch(() => null);
          if (retryUrl) {
            imgBuf = await callJailApi(retryUrl);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      await sock.sendMessage(jid, {
        image: imgBuf,
        caption: `🔒 *Behind Bars!*\n\n> 🤖 *${config?.botName || 'AA MD Bot'}*`,
      }, { quoted: msg });
      await react('✅');
    } catch (e) {
      await react('❌');
      const msg = e.response ? extractApiError(e) : e.message;
      reply(`❌ *Jail effect failed*\n\n${msg}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
