// ============================================
// AA MD Bot - Facebook Downloader
// Method 1: fdownloader.net JSON API
// Method 2: getvideourl.com API
// Method 3: Direct HTML scrape (public posts)
// Method 4: yt-dlp (last resort)
// ============================================

import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { YTDLP, getCookiesArgs } from '../../lib/ytdlp.js';

const execFileP = promisify(execFile);
const FB_RX     = /https?:\/\/(www\.|m\.|web\.)?facebook\.com\/[^\s]+|https?:\/\/fb\.watch\/[^\s]+/i;
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
// ── Method 1: fdownloader.net ─────────────────────────────────────────────────
async function fdownloader(url) {
  const res = await axios.post(
    'https://fdownloader.net/api/ajaxSearch',
    `q=${encodeURIComponent(url)}&lang=en&web=facebook`,
    {
      headers: {
        'Content-Type':     'application/x-www-form-urlencoded',
        'User-Agent':       UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer':          'https://fdownloader.net/',
      },
      timeout: 18000,
    }
  );
  const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  const hdMatch  = html.match(/href=["'](https?:\/\/[^"']*video[^"']*)\s*["'][^>]*>\s*(?:HD|High)/i);
  const sdMatch  = html.match(/href=["'](https?:\/\/[^"']*video[^"']*)\s*["'][^>]*>\s*(?:SD|Normal)/i);
  const anyMatch = html.match(/href=["'](https?:\/\/(?:video\.f?acdn|[^"']*fbcdn)[^"']+\.mp4[^"']*)/i);
  const videoUrl = hdMatch?.[1] || sdMatch?.[1] || anyMatch?.[1];
  if (!videoUrl) throw new Error('fdownloader: no video url');
  return videoUrl;
}

// ── Method 2: getvideourl.com ─────────────────────────────────────────────────
async function getvideourl(url) {
  const form = new URLSearchParams({ url });
  const { data } = await axios.post('https://getvideourl.com/api/facebook', form.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   UA,
      'Referer':      'https://getvideourl.com/',
    },
    timeout: 18000,
  });
  const videoUrl = data?.hd || data?.sd || data?.url;
  if (!videoUrl) throw new Error('getvideourl: no url');
  return videoUrl;
}

// ── Method 3: direct HTML scrape (public posts) ───────────────────────────────
async function scrapeFbPage(url) {
  const desktop = url
    .replace(/m\.facebook\.com/, 'www.facebook.com')
    .replace(/web\.facebook\.com/, 'www.facebook.com');

  const { data: html } = await axios.get(desktop, {
    headers: {
      'User-Agent':      UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept':          'text/html,application/xhtml+xml',
      'Sec-Fetch-Mode':  'navigate',
    },
    timeout: 20000,
    maxRedirects: 5,
  });

  const unescape = (s) => s
    .replace(/\\u0026/g, '&')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"');

  const patterns = [
    /"hd_src":"([^"]+)"/,
    /"sd_src":"([^"]+)"/,
    /"browser_native_hd_url":"([^"]+)"/,
    /"browser_native_sd_url":"([^"]+)"/,
    /\"playable_url_quality_hd\":\"([^"]+)\"/,
    /\"playable_url\":\"([^"]+)\"/,
  ];

  for (const rx of patterns) {
    const m = html.match(rx);
    if (m?.[1]) {
      const link = unescape(m[1]);
      if (link.startsWith('http')) return link;
    }
  }
  throw new Error('scrape: no video URL in page');
}

// ── Method 4: yt-dlp ─────────────────────────────────────────────────────────
async function ytdlpFb(url) {
  const args = [
    url,
    '-f', 'best[ext=mp4][height<=480]/best[ext=mp4]/best',
    '--get-url',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '20',
    ...getCookiesArgs(),
  ];
  const { stdout } = await execFileP(YTDLP, args, { timeout: 40000 });
  const link = stdout.trim().split('\n')[0];
  if (!link?.startsWith('http')) throw new Error('yt-dlp: no URL');
  return link;
}

export default {
  command: 'fb',
  alias: ['facebook', 'fbdl', 'fbvideo'],
  description: 'Download Facebook videos and reels',
  category: 'download',

  async execute({ text, msg, reply, react, sock, jid, prefix }) {
    let url = text?.trim();
    if (!url) {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (q) url = (q.conversation || q.extendedTextMessage?.text || '').trim();
    }
    const match = url?.match(FB_RX);
    if (!match) {
      return reply(
        `📘 *Facebook Downloader*\n\n` +
        `*Usage:* ${prefix}fb <link>\n` +
        `*Supports:* Public Videos • Reels\n\n` +
        `*Example:*\n` +
        `${prefix}fb https://www.facebook.com/watch?v=xxx\n` +
        `${prefix}fb https://fb.watch/xxx\n\n` +
        `> 📘 *AA MD Bot*`
      );
    }

    await react('⏳');
    url = match[0].replace(/[.,!?;]$/, '');

    const cap  = `📘 *Facebook*\n\n> 🤖 *AA MD Bot*`;
    const send = (videoUrl) => sock.sendMessage(jid,
      { video: { url: videoUrl }, mimetype: 'video/mp4', caption: cap },
      { quoted: msg }
    );

    const methods = [
      ['fdownloader',    () => fdownloader(url).then(send)],
      ['getvideourl',    () => getvideourl(url).then(send)],
      ['scrape',         () => scrapeFbPage(url).then(send)],
      ['yt-dlp',         () => ytdlpFb(url).then(send)],
    ];

    for (const [, fn] of methods) {
      try {
        await fn();
        return react('✅');
      } catch {}
    }

    await react('❌');
    reply(
      `❌ *Facebook download failed*\n\n` +
      `Make sure the post is *public*.\n` +
      `Private posts, stories, and reels with restricted sharing cannot be downloaded.\n\n` +
      `🔗 Try manually: https://fdownloader.net\n\n` +
      `> 📘 *AA MD Bot*`
    );
  },
};
