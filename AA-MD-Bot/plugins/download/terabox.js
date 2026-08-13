// ============================================
// AA MD Bot - Dedicated TeraBox Downloader
// Downloads public TeraBox links with multiple API fallbacks.
// ============================================

import axios from 'axios';

const TB_URL = /https?:\/\/(www\.)?(terabox\.com|1024terabox\.com|teraboxapp\.com|freeterabox\.com|terabox\.app|teraboxlink\.com|terafileshare\.com|4funbox\.co|mirrobox\.com|nephobox\.com|momerybox\.com|teraboxshare\.com)\/\S+/i;
const MAX_BYTES = Number(process.env.MAX_WA_DOWNLOAD_MB || 95) * 1024 * 1024;

const api = axios.create({
  timeout: 45000,
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/json,text/html,*/*',
  },
});

function pickUrl(text = '') {
  return text.match(TB_URL)?.[0]?.replace(/[.,!?;]$/, '') || null;
}

function flattenFiles(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenFiles(item, out);
    return out;
  }
  if (typeof value !== 'object') return out;

  const url = value.download_url || value.downloadUrl || value.direct_link || value.directLink || value.dlink || value.link || value.url;
  if (url && /^https?:\/\//i.test(url)) {
    out.push({
      url,
      filename: value.filename || value.file_name || value.name || value.title || 'terabox-file',
      size: value.size || value.file_size || value.size_text || '',
      mimetype: value.mimetype || value.mime || value.content_type || 'application/octet-stream',
    });
  }

  for (const key of ['files', 'list', 'result', 'results', 'data', 'items']) {
    if (value[key] && value[key] !== value) flattenFiles(value[key], out);
  }
  return out;
}

async function resolveTeraBox(url) {
  const custom = process.env.TERABOX_API_URL;
  const endpoints = [
    custom && (custom.includes('{url}') ? custom.replace('{url}', encodeURIComponent(url)) : `${custom}${custom.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`),
    `https://teraboxdownloader.online/api/download?url=${encodeURIComponent(url)}`,
    `https://terabox-dl-api.vercel.app/api?url=${encodeURIComponent(url)}`,
    `https://api.terabox.app/api?url=${encodeURIComponent(url)}`,
    `https://terabox-api-ochre.vercel.app/api?url=${encodeURIComponent(url)}`,
  ].filter(Boolean);

  for (const endpoint of endpoints) {
    try {
      const { data } = await api.get(endpoint);
      const files = flattenFiles(data).filter((file) => file.url);
      if (files.length) return files;
    } catch {}
  }
  return [];
}

function kindOf(mime = '', filename = '') {
  const m = mime.toLowerCase();
  const f = filename.toLowerCase();
  if (m.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f)) return 'image';
  if (m.startsWith('video/') || /\.(mp4|mkv|mov|webm|avi)$/i.test(f)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|opus)$/i.test(f)) return 'audio';
  return 'document';
}

async function downloadFile(url, fallbackName, fallbackMime) {
  const res = await api.get(url, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
    headers: { Referer: 'https://www.terabox.com/' },
  });
  const buf = Buffer.from(res.data || []);
  if (!buf.length) throw new Error('TeraBox file download returned empty data.');
  if (buf.length > MAX_BYTES) throw new Error(`File is too large for WhatsApp (${Math.ceil(buf.length / 1024 / 1024)}MB).`);
  const cd = res.headers?.['content-disposition'] || '';
  const cdName = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filename = (cdName ? decodeURIComponent(cdName[1] || cdName[2]) : fallbackName || 'terabox-file').replace(/[\/:*?"<>|]/g, '_').slice(0, 120);
  const mimetype = res.headers?.['content-type']?.split(';')[0] || fallbackMime || 'application/octet-stream';
  return { buf, filename, mimetype, kind: kindOf(mimetype, filename) };
}

async function sendFile(sock, jid, msg, file, caption) {
  if (file.kind === 'image') return sock.sendMessage(jid, { image: file.buf, mimetype: file.mimetype, caption }, { quoted: msg });
  if (file.kind === 'video') return sock.sendMessage(jid, { video: file.buf, mimetype: file.mimetype, caption }, { quoted: msg });
  if (file.kind === 'audio') return sock.sendMessage(jid, { audio: file.buf, mimetype: file.mimetype, fileName: file.filename, ptt: false }, { quoted: msg });
  return sock.sendMessage(jid, { document: file.buf, mimetype: file.mimetype, fileName: file.filename, caption }, { quoted: msg });
}

export default {
  command: 'terabox',
  alias: ['tb', 'tbdl', 'teradl', 'teraboxdl'],
  description: 'Download files from public TeraBox links',
  category: 'download',
  usage: '.terabox <terabox link>',

  async execute({ sock, msg, jid, text, reply, react, prefix }) {
    let url = pickUrl(text);
    if (!url) {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
      url = pickUrl(quotedText);
    }
    if (!url) return reply(`☁️ *TeraBox Downloader*\n\nUsage: *${prefix}terabox <link>*\nYou can also reply to a message containing a TeraBox link.`);

    await react('⏳');
    try {
      const files = await resolveTeraBox(url);
      if (!files.length) throw new Error('Could not generate a direct download link. If public APIs are blocked, set TERABOX_API_URL.');

      for (const item of files.slice(0, 3)) {
        const file = await downloadFile(item.url, item.filename, item.mimetype);
        await sendFile(sock, jid, msg, file, `☁️ *TeraBox Download*\n\n📄 ${file.filename}${item.size ? `\n📦 ${item.size}` : ''}\n\n> 💠 *AA MD Bot*`);
      }
      await react('✅');
    } catch (e) {
      await react('❌');
      return reply(`❌ *TeraBox download failed*\n\n${e.message}\n\n💡 Try again later or configure *TERABOX_API_URL* for a private resolver.`);
    }
  },
};
