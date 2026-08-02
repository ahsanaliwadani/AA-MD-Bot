// ============================================
// AA MD Bot — XVideos Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Search via DC /xxx/xvideos API
// Method 1: CDN preview.mp4 (fast, no yt-dlp)
// Method 2: yt-dlp (full video, fallback)
// ============================================

import axios from 'axios';
import fs    from 'fs-extra';
import path  from 'path';
import { execFile }      from 'child_process';
import { promisify }     from 'util';
import { fileURLToPath } from 'url';
import { generateId }    from '../../lib/helper.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP      = path.join(__dirname, '../../temp');
const DC        = 'https://apis.davidcyriltech.my.id';
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FOOTER    = '\n\n> 🔞 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';
const MAX_BYTES = 45 * 1024 * 1024; // 45 MB

// ── Find yt-dlp binary at runtime ────────────────────────────────────────────
function findYtDlp() {
  const candidates = [
    '/home/runner/.local/bin/yt-dlp',
    process.env.YTDLP_PATH,
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'yt-dlp'; // fall back to PATH lookup
}

// ── Download CDN preview clip (fast ~15s clip, no yt-dlp) ────────────────────
async function tryCdnPreview(previewUrl) {
  const res = await axios.get(previewUrl, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': UA,
      'Referer':    'https://www.xvideos.com/',
      'Origin':     'https://www.xvideos.com',
    },
    timeout: 40000,
    maxContentLength: 30 * 1024 * 1024,
  });
  const buf = Buffer.from(res.data);
  if (!buf.length || buf.length < 5000) throw new Error('CDN clip too small');
  return buf;
}

// ── Full download via yt-dlp ─────────────────────────────────────────────────
async function tryYtDlp(pageUrl, outFile) {
  const ytdlp = findYtDlp();
  await execFileAsync(ytdlp, [
    '-f', 'b[ext=mp4][filesize<45M]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', outFile,
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '30',
    '--retries', '3',
    '-N', '4',
    '--add-header', 'Referer:https://www.xvideos.com/',
    pageUrl,
  ], { timeout: 180_000 });

  if (!fs.existsSync(outFile)) throw new Error('yt-dlp produced no output file');
  const st = fs.statSync(outFile);
  if (st.size < 10_000) throw new Error('Downloaded file is too small / corrupted');
  if (st.size > MAX_BYTES) throw new Error(`File too large (${Math.round(st.size/1048576)}MB)`);
  return await fs.readFile(outFile);
}

export default {
  command:     'xv',
  alias:       ['xvideos', 'xvid', 'xvideo'],
  description: 'Search & send adult video from XVideos 🔞',
  category:    'fun',
  usage:       '.xv <search term>',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
    // ── Self-chat only ──────────────────────────────────────────────────────
    if (!fromMe) return;

    const query = (text || '').trim();
    if (!query) {
      return reply(
        `🔞 *XVideos Downloader*\n\n` +
        `*Usage:* ${prefix}xv <search>\n` +
        `*Examples:*\n▸ ${prefix}xv asian\n▸ ${prefix}xv cute\n▸ ${prefix}xv romantic\n\n` +
        `⚠️ _Adult content — 18+ only_${FOOTER}`
      );
    }

    await react('🔞');
    let tmpFile = null;

    try {
      await reply(`🔍 _Searching XVideos for "${query}"..._`);

      // ── 1. Search via DC API ──────────────────────────────────────────────
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || apiRes?.results || apiRes?.data || [];
      if (!Array.isArray(results) || !results.length)
        throw new Error(`No results found for "${query}"`);

      // Pick random from top 10
      const pool = results.slice(0, Math.min(results.length, 10));
      const pick = pool[Math.floor(Math.random() * pool.length)];

      const pageUrl   = pick.url || pick.link;
      if (!pageUrl)   throw new Error('No video page URL in search result');

      const title     = pick.title    || query;
      const duration  = pick.duration || '';
      const views     = pick.views    || '';
      const previewUrl = typeof pick.thumbnail === 'object'
        ? (pick.thumbnail?.preview || null)
        : null;
      const coverUrl   = typeof pick.thumbnail === 'object'
        ? (pick.thumbnail?.cover || null)
        : null;

      const caption =
        `🔞 *XVideos*\n\n` +
        `🎬 *${title.slice(0, 100)}*\n` +
        (views    ? `👁️ ${views}   ` : '') +
        (duration ? `⏱️ ${duration}\n` : '\n') +
        `🔗 ${pageUrl}${FOOTER}`;

      // ── 2. Try CDN preview clip first (no yt-dlp needed) ─────────────────
      if (previewUrl) {
        await reply(`📥 _Fetching preview clip..._`);
        try {
          const buf = await tryCdnPreview(previewUrl);
          await sock.sendMessage(jid, {
            video: buf, mimetype: 'video/mp4', caption,
          }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.warn('[xv] CDN preview failed:', e.message);
        }
      }

      // ── 3. Try cover thumbnail as image if video fails ────────────────────
      if (coverUrl) {
        try {
          const res = await axios.get(coverUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA, 'Referer': 'https://www.xvideos.com/' },
            timeout: 15000,
          });
          const imgBuf = Buffer.from(res.data);
          if (imgBuf.length > 1000) {
            await sock.sendMessage(jid, {
              image: imgBuf,
              caption: caption + '\n\n_⚠️ Video clip unavailable — showing thumbnail_',
            }, { quoted: msg });
            return await react('✅');
          }
        } catch {}
      }

      // ── 4. Full video via yt-dlp ──────────────────────────────────────────
      await reply(`📥 _Downloading full video via yt-dlp (30–90 sec)..._`);
      await fs.ensureDir(TEMP);
      const id = generateId();
      tmpFile  = path.join(TEMP, `xv_${id}.mp4`);

      const buf = await tryYtDlp(pageUrl, tmpFile);
      await sock.sendMessage(jid, {
        video: buf, mimetype: 'video/mp4', caption,
      }, { quoted: msg });
      await react('✅');

    } catch (err) {
      await react('❌');
      const msg2 = (err.message || 'Unknown error').slice(0, 200);
      await reply(
        `❌ *XVideos Failed*\n\n_${msg2}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords\n▸ Try again in a moment${FOOTER}`
      );
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
