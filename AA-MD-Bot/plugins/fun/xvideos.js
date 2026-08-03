// ============================================
// AA MD Bot — Adult Video Search & Send 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — owner's "You" chat only
//
// How it works (Pakistan-safe):
//   Bot runs on Replit (outside Pakistan) →
//   downloads full MP4 on server →
//   sends buffer to WhatsApp.
//   User's phone NEVER contacts blocked sites.
//
// Download priority:
//   1. Eporner.com (yt-dlp → signed CDN URL → full MP4)
//   2. XVideos via DC API (yt-dlp → HLS download → MP4)
//   3. XNXX via DC API (yt-dlp → MP4)
//   4. Preview clip (5s, last resort)
//   5. Thumbnail image (absolute last resort)
// ============================================

import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileP = promisify(execFile);
const DC        = 'https://apis.davidcyriltech.my.id';
const YTDLP     = '/home/runner/.local/bin/yt-dlp';
const TEMP_DIR  = '/home/runner/workspace/AA-MD-Bot/temp';
const FOOTER    = '\n\n> 🔞 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ── yt-dlp: get direct CDN URL (no download yet) ─────────────────────────────
// Works best for eporner (returns signed MP4 CDN URL).
// For xvideos/xnxx returns HLS m3u8 — use ytdlpDownload for those.
async function ytdlpGetUrl(pageUrl, format = 'best[height<=360][ext=mp4]/best[height<=360]/best[ext=mp4]/best') {
  const { stdout } = await execFileP(YTDLP, [
    '-g',
    '-f', format,
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '15',
    pageUrl,
  ], { timeout: 30000 });

  const lines = stdout.trim().split('\n').filter(Boolean);
  return lines[0] || null; // first line = video URL
}

// ── yt-dlp: download to temp file, return buffer ─────────────────────────────
// Used for HLS/fragmented sources (xvideos/xnxx) that can't be downloaded
// with a simple axios GET — yt-dlp handles the stitching internally.
async function ytdlpDownload(pageUrl, reqId) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const outFile = path.join(TEMP_DIR, `xv_${reqId}.mp4`);

  try {
    await execFileP(YTDLP, [
      '-o', outFile,
      '-f', 'best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best',
      '--no-warnings',
      '--no-playlist',
      '--socket-timeout', '20',
      '--merge-output-format', 'mp4',
      pageUrl,
    ], { timeout: 90000 });

    if (!fs.existsSync(outFile)) throw new Error('Output file not created');
    const stat = fs.statSync(outFile);
    if (stat.size < 20000)       throw new Error(`File too small: ${stat.size} bytes`);
    if (stat.size > 60 * 1024 * 1024) throw new Error(`File too large: ${(stat.size/1024/1024).toFixed(0)} MB`);

    const buf = fs.readFileSync(outFile);
    return buf;
  } finally {
    try { fs.unlinkSync(outFile); } catch {}
  }
}

// ── Axios buffer download (for signed CDN URLs from yt-dlp -g) ───────────────
async function downloadBuffer(url, maxMB = 55, timeoutMs = 90000) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA },
    timeout: timeoutMs,
    maxContentLength: maxMB * 1024 * 1024,
    maxRedirects: 10,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 20000) throw new Error(`Downloaded file too small: ${buf.length} bytes`);
  return buf;
}

// ── Eporner search ────────────────────────────────────────────────────────────
async function searchEporner(query, limit = 10) {
  const { data } = await axios.get('https://www.eporner.com/api/v2/video/search/', {
    params: { query, per_page: limit, page: 1, order: 'top-rated', gay: 0, format: 'json' },
    headers: { 'User-Agent': UA },
    timeout: 12000,
  });
  return (data?.videos || []).map(v => ({
    title:    v.title || '',
    pageUrl:  v.url || `https://www.eporner.com/video-${v.id}/`,
    thumb:    v.default_thumb?.src || v.default_thumb || '',
    duration: v.length_min || '',
    views:    v.views ? `${Number(v.views).toLocaleString()} views` : '',
    _src:     'eporner',
  }));
}

// ── DC xvideos search ─────────────────────────────────────────────────────────
async function searchXVideos(query, limit = 6) {
  const { data } = await axios.get(`${DC}/xxx/xvideos`, {
    params: { q: query }, headers: { 'User-Agent': UA }, timeout: 12000,
  });
  return (data?.data?.results || data?.results || []).slice(0, limit).map(r => ({
    title:      r.title || '',
    pageUrl:    r.url   || '',
    previewUrl: r.thumbnail?.preview || null,
    coverUrl:   r.thumbnail?.cover   || null,
    duration:   r.duration || '',
    views:      r.views    || '',
    _src:       'xvideos',
  }));
}

// ── DC xnxx search ────────────────────────────────────────────────────────────
async function searchXnxx(query, limit = 6) {
  const { data } = await axios.get(`${DC}/xxx/xnxx`, {
    params: { q: query }, headers: { 'User-Agent': UA }, timeout: 12000,
  });
  return (data?.data?.results || data?.results || []).slice(0, limit).map(r => ({
    title:      r.title || '',
    pageUrl:    r.url || r.link || '',
    previewUrl: r.thumbnail?.preview || null,
    coverUrl:   r.thumbnail?.cover   || null,
    duration:   r.duration || '',
    views:      r.views    || '',
    _src:       'xnxx',
  }));
}

function makeCaption(r, query) {
  const srcMap = { eporner: 'Eporner', xvideos: 'XVideos', xnxx: 'XNXX' };
  const label  = srcMap[r._src] || 'Adult';
  const title  = (r.title || query).slice(0, 100);
  return (
    `🔞 *${label}*\n\n🎬 *${title}*\n` +
    (r.duration ? `⏱️ ${r.duration}   ` : '') +
    (r.views    ? `👁️ ${r.views}` : '') +
    `\n🔗 ${r.pageUrl || ''}${FOOTER}`
  );
}

export default {
  command:     'xv',
  alias:       ['xvideos', 'xvid', 'xvideo', 'xnxx', 'pornvideo', 'pv'],
  description: 'Search & send full adult video 🔞 (Pakistan-safe)',
  category:    'fun',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
    if (!fromMe) return;

    const query = (text || '').trim();
    if (!query) {
      return reply(
        `🔞 *Adult Video Search*\n\n` +
        `*Usage:* ${prefix}xv <search>\n\n` +
        `*Sources:* Eporner + XVideos + XNXX\n` +
        `*Format:* Full MP4, plays on WhatsApp even in Pakistan 🇵🇰\n\n` +
        `*Examples:*\n▸ ${prefix}xv asian\n▸ ${prefix}xv romantic\n▸ ${prefix}xv cute girl\n\n` +
        `⚠️ _18+ only — self chat only_${FOOTER}`
      );
    }

    await react('🔞');
    await reply(`🔍 _Searching for "${query}"..._`);

    const reqId = Date.now();

    try {
      // ── Fetch all sources in parallel ─────────────────────────────────────
      const [epRes, xvRes, xnRes] = await Promise.allSettled([
        searchEporner(query, 12),
        searchXVideos(query, 6),
        searchXnxx(query, 6),
      ]);

      const epornerList = epRes.status === 'fulfilled' ? epRes.value : [];
      const xvList      = xvRes.status === 'fulfilled' ? xvRes.value : [];
      const xnList      = xnRes.status === 'fulfilled' ? xnRes.value : [];

      if (!epornerList.length && !xvList.length && !xnList.length) {
        throw new Error(`No results found for "${query}"`);
      }

      const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
      const epornerPool = shuffle(epornerList).slice(0, 8);
      const xvPool      = shuffle(xvList).slice(0, 4);
      const xnPool      = shuffle(xnList).slice(0, 4);

      // ─────────────────────────────────────────────────────────────────────
      // PASS 1: Eporner via yt-dlp → signed CDN MP4 URL → axios download
      //   yt-dlp returns a signed URL with Replit IP embedded — download
      //   immediately with axios. Full video (5-30 min), ~15-50 MB.
      // ─────────────────────────────────────────────────────────────────────
      for (const r of epornerPool) {
        if (!r.pageUrl) continue;
        try {
          await react('📥');
          console.log('[xv] trying eporner yt-dlp:', r.pageUrl);

          const cdnUrl = await ytdlpGetUrl(r.pageUrl);
          if (!cdnUrl || !cdnUrl.startsWith('http')) throw new Error('No CDN URL from yt-dlp');

          // CDN URL is signed for THIS Replit instance — download right away
          const buf = await downloadBuffer(cdnUrl, 55, 100000);
          const caption = makeCaption(r, query);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.error('[xv eporner yt-dlp]', e.message?.slice(0, 120));
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // PASS 2: XVideos via yt-dlp download (handles HLS → MP4 internally)
      //   yt-dlp downloads and stitches HLS to a proper MP4 file.
      // ─────────────────────────────────────────────────────────────────────
      for (const r of xvPool) {
        if (!r.pageUrl) continue;
        try {
          await react('📥');
          console.log('[xv] trying xvideos yt-dlp download:', r.pageUrl);
          const buf = await ytdlpDownload(r.pageUrl, reqId + '_xv');
          const caption = makeCaption(r, query);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.error('[xv xvideos yt-dlp]', e.message?.slice(0, 120));
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // PASS 3: XNXX via yt-dlp download
      // ─────────────────────────────────────────────────────────────────────
      for (const r of xnPool) {
        if (!r.pageUrl) continue;
        try {
          await react('📥');
          console.log('[xv] trying xnxx yt-dlp download:', r.pageUrl);
          const buf = await ytdlpDownload(r.pageUrl, reqId + '_xn');
          const caption = makeCaption(r, query);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.error('[xv xnxx yt-dlp]', e.message?.slice(0, 120));
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // PASS 4: Preview clips (xvideos/xnxx thumbnail.preview ~5s)
      //   Short clips but they DO play on WhatsApp.
      // ─────────────────────────────────────────────────────────────────────
      const previewPool = [...xvPool, ...xnPool].filter(r => r.previewUrl);
      for (const r of previewPool) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          const res = await axios.get(r.previewUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA, Referer: referer },
            timeout: 30000, maxContentLength: 20 * 1024 * 1024,
          });
          const buf = Buffer.from(res.data);
          if (buf.length < 10000) continue;
          const caption = makeCaption(r, query) + '\n\n_⚠️ Preview clip (short) — bot will retry full video next time_';
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      // ─────────────────────────────────────────────────────────────────────
      // PASS 5: Eporner thumbnail image (absolute last resort)
      // ─────────────────────────────────────────────────────────────────────
      for (const r of epornerPool.filter(x => x.thumb)) {
        try {
          const res = await axios.get(r.thumb, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA },
            timeout: 15000, maxContentLength: 5 * 1024 * 1024,
          });
          const buf = Buffer.from(res.data);
          if (buf.length < 5000) continue;
          const caption = makeCaption(r, query) + '\n\n_📸 Thumbnail — servers busy, try again_';
          await sock.sendMessage(jid, { image: buf, caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      throw new Error('All download attempts exhausted. Try different keywords or try again in a minute.');

    } catch (err) {
      await react('❌');
      await reply(
        `❌ *Download Failed*\n\n_${(err.message || 'Unknown error').slice(0, 200)}_\n\n` +
        `💡 *Try:* simpler keywords — "romantic" "cute" "asian" "hot"${FOOTER}`
      );
    }
  },
};
