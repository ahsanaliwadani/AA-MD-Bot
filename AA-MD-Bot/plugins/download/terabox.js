// ============================================
// AA MD Bot - TeraBox Downloader
// No-cookie public API fallbacks + safe link normalization
// ============================================

import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const TERABOX_RX = /https?:\/\/(?:www\.)?(?:terabox\.com|1024tera\.com|teraboxapp\.com|terasharelink\.com|teraboxlink\.com|4funbox\.com|mirrobox\.com|nephobox\.com|freeterabox\.com|terabox\.app)\/[^\s]+/i;

const api = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' },
});


function cleanUrl(value = '') {
  return value.trim().replace(/[.,!?;]+$/, '');
}

function pickUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const keys = [
    'downloadLink', 'download_link', 'direct_link', 'directLink',
    'downloadUrl', 'download_url', 'download', 'dlink', 'link', 'url',
    'fast_download_link', 'slow_download_link', 'proxy_url',
  ];
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && /^https?:\/\//i.test(val)) return val;
  }
  return null;
}

function normalizeFile(item, fallbackName = 'terabox-file') {
  const directUrl = pickUrl(item);
  if (!directUrl) return null;
  return {
    directUrl,
    name: item?.filename || item?.file_name || item?.file_name_original || item?.name || item?.server_filename || item?.fileName || fallbackName,
    size: item?.size || item?.filesize || item?.file_size || item?.file_size_formatted || item?.sizebytes || item?.size_bytes || '',
    thumbnail: item?.thumb || item?.thumbnail || item?.image || item?.screenshot || null,
  };
}

function walkForFiles(value, found = [], depth = 0) {
  if (!value || depth > 6) return found;
  if (Array.isArray(value)) {
    for (const item of value) walkForFiles(item, found, depth + 1);
    return found;
  }
  if (typeof value !== 'object') return found;

  const file = normalizeFile(value);
  if (file) found.push(file);

  for (const key of ['result', 'data', 'files', 'list', 'items', 'file', 'download', 'response']) {
    if (value[key]) walkForFiles(value[key], found, depth + 1);
  }
  return found;
}

function collectFiles(data) {
  const found = walkForFiles(data);

  const seen = new Set();
  return found.filter((file) => {
    if (seen.has(file.directUrl)) return false;
    seen.add(file.directUrl);
    return true;
  });
}

async function tryApi(name, request) {
  const { data } = await request();
  const files = collectFiles(data);
  if (!files.length) throw new Error(`${name}: no direct file link`);
  return files;
}

function extractSurl(url) {
  const match = String(url).match(/\/s\/([A-Za-z0-9_-]+)/) || String(url).match(/[?&]surl=([A-Za-z0-9_-]+)/);
  return match?.[1] || null;
}

async function fetchTeraBoxFiles(url) {
  const encoded = encodeURIComponent(url);
  const surl = extractSurl(url);
  const attempts = [
    ['TeraCore', () => api.get(`https://tera-core.vercel.app/api?url=${encoded}`)],
    ['TeraCoreResolved', () => api.get(`https://tera-core.vercel.app/api?url=${encoded}&resolve=true`)],
    ...(surl ? [['TeraCoreResolveMode', () => api.get(`https://tera-core.vercel.app/api?mode=resolve&surl=${encodeURIComponent(surl)}`)]] : []),
    ['DavidCyrilTech', () => api.get(`https://apis.davidcyriltech.my.id/terabox?url=${encoded}`)],
    ['TeraDL', () => api.get(`https://teradl-api.dapuntaratya.com/download?url=${encoded}`)],
    ['TeraBoxAPI', () => api.get(`https://terabox-api.vercel.app/api?url=${encoded}`)],
    ['TeraBoxApp', () => api.get(`https://teraboxapp.xyz/api/terabox?url=${encoded}`)],
    ['TeraBoxDLsite', () => api.get(`https://teraboxdl.site/api?url=${encoded}`)],
  ];

  const errors = [];
  for (const [name, request] of attempts) {
    try {
      return await tryApi(name, request);
    } catch (err) {
      errors.push(`${name}: ${err.response?.status || err.message || 'failed'}`);
    }
  }
  throw new Error(`No-cookie TeraBox download link not found. Tried: ${errors.slice(0, 4).join(' | ')}`);
}

export default {
  command: 'terabox',
  alias: ['tb', 'teradl', 'teradown', 'teraboxdl'],
  description: 'Download public TeraBox files',
  usage: '.terabox <terabox link>',
  category: 'download',

  async execute({ text, msg, reply, react, sock, jid, prefix }) {
    let raw = text?.trim();
    if (!raw) {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quoted) raw = (quoted.conversation || quoted.extendedTextMessage?.text || '').trim();
    }

    const match = cleanUrl(raw || '').match(TERABOX_RX);
    if (!match) {
      return reply(
        `📦 *TeraBox Downloader*\n\n` +
        `*Usage:* ${prefix}terabox <link>\n` +
        `*Alias:* ${prefix}tb <link>\n\n` +
        `Send or reply to a public TeraBox share link.`
      );
    }

    await react('⏳');
    try {
      const files = await fetchTeraBoxFiles(cleanUrl(match[0]));
      const limited = files.slice(0, 5);
      if (files.length > limited.length) {
        await reply(`📦 Found ${files.length} files. Sending first ${limited.length} files to avoid spam.`);
      }

      for (const file of limited) {
        await sock.sendMessage(jid, {
          document: { url: file.directUrl },
          fileName: file.name || 'terabox-file',
          mimetype: 'application/octet-stream',
          caption:
            `📦 *TeraBox Download*\n` +
            `📄 *File:* ${file.name || 'terabox-file'}\n` +
            (file.size ? `📏 *Size:* ${file.size}\n` : '') +
            `\n> 🤖 *AA MD Bot*`,
        }, { quoted: msg });
      }
      await react('✅');
    } catch (err) {
      await react('❌');
      return reply(
        `❌ *TeraBox download failed*\n\n` +
        `${err.message}\n\n` +
        `Make sure the link is public, not expired, and does not require a password/CAPTCHA.`
      );
    }
  },
};
