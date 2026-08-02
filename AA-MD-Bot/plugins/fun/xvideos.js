// ============================================
// AA MD Bot — XVideos + XNXX Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Sources: DC xvideos API + DC xnxx API (both confirmed working)
// Method 1: CDN preview clip (fast, no yt-dlp, confirmed working)
// Method 2: yt-dlp fallback for full videos
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
const MAX_BYTES = 45 * 1024 * 1024;

// ── Dynamic yt-dlp path ───────────────────────────────────────────────────────
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
  return 'yt-dlp';
}

// ── Search both APIs and merge results ───────────────────────────────────────
async function searchVideos(query) {
  const [xvRes, xnRes] = await Promise.allSettled([
    axios.get(`${DC}/xxx/xvideos`, {
      params: { q: query }, headers: { 'User-Agent': UA }, timeout: 15000,
    }),
    axios.get(`${DC}/xxx/xnxx`, {
      params: { q: query }, headers: { 'User-Agent': UA }, timeout: 15000,
    }),
  ]);

  const xvResults = xvRes.status === 'fulfilled'
    ? (xvRes.value.data?.data?.results || xvRes.value.data?.results || []).map(r => ({
        ...r, _src: 'xvideos',
        previewUrl: r.thumbnail?.preview || null,
        coverUrl:   r.thumbnail?.cover   || null,
        pageUrl:    r.url || r.link || '',
      }))
    : [];

  const xnResults = xnRes.status === 'fulfilled'
    ? (xnRes.value.data?.data?.results || xnRes.value.data?.results || []).map(r => ({
        ...r, _src: 'xnxx',
        previewUrl: r.thumbnail?.preview || null,
        coverUrl:   r.thumbnail?.cover   || null,
        pageUrl:    r.url || r.link || '',
      }))
    : [];

  // Merge: interleave both sources for variety, prioritise results with preview clips
  const withPreview    = [...xvResults, ...xnResults].filter(r => r.previewUrl);
  const withoutPreview = [...xvResults, ...xnResults].filter(r => !r.previewUrl);
  return [...withPreview, ...withoutPreview];
}

// ── Try CDN preview clip download ─────────────────────────────────────────────
async function tryCdnPreview(previewUrl, referer) {
  const res = await axios.get(previewUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA, 'Referer': referer, 'Origin': new URL(referer).origin },
    timeout: 45000,
    maxContentLength: 35 * 1024 * 1024,
  });
  const buf = Buffer.from(res.data);
  if (!buf.length || buf.length < 10000) throw new Error('Preview clip too small');
  return buf;
}

// ── Try yt-dlp full download ──────────────────────────────────────────────────
async function tryYtDlp(pageUrl, outFile) {
  const ytdlp = findYtDlp();
  await execFileAsync(ytdlp, [
    '-f', 'b[ext=mp4][filesize<45M]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', outFile,
    '--no-playlist', '--no-warnings',
    '--socket-timeout', '30', '--retries', '3', '-N', '4',
    '--add-header', `Referer:${pageUrl.includes('xnxx') ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/'}`,
    pageUrl,
  ], { timeout: 180_000 });
  if (!fs.existsSync(outFile)) throw new Error('No output file produced');
  const st = fs.statSync(outFile);
  if (st.size < 10_000) throw new Error('File too small / corrupted');
  if (st.size > MAX_BYTES) throw new Error(`File too large (${Math.round(st.size / 1048576)}MB)`);
  return await fs.readFile(outFile);
}

export default {
  command:     'xv',
  alias:       ['xvideos', 'xvid', 'xvideo', 'xnxx', 'pornvideo', 'pv'],
  description: 'Search & send adult video (XVideos + XNXX) 🔞',
  category:    'fun',
  usage:       '.xv <search term>',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
    if (!fromMe) return;

    const query = (text || '').trim();
    if (!query) {
      return reply(
        `🔞 *Adult Video Search*\n\n` +
        `*Usage:* ${prefix}xv <search>\n\n` +
        `*Sources:* XVideos + XNXX (dual API)\n\n` +
        `*Examples:*\n▸ ${prefix}xv asian\n▸ ${prefix}xv romantic\n▸ ${prefix}xv cute girl\n\n` +
        `⚠️ _18+ only — self chat only_${FOOTER}`
      );
    }

    await react('🔞');
    let tmpFile = null;

    try {
      await reply(`🔍 _Searching XVideos + XNXX for "${query}"..._`);

      // ── 1. Search both APIs ───────────────────────────────────────────────
      const results = await searchVideos(query);
      if (!results.length) throw new Error(`No results found for "${query}"`);

      // Pick randomly from top 15 results (prefer ones with preview clips)
      const pool = results.slice(0, Math.min(results.length, 15));
      const pick = pool[Math.floor(Math.random() * pool.length)];

      const title      = pick.title    || query;
      const duration   = pick.duration || '';
      const views      = pick.views    || '';
      const rating     = pick.rating   || '';
      const resolution = pick.resolution || '';
      const src        = pick._src === 'xnxx' ? 'XNXX' : 'XVideos';
      const referer    = pick._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';

      const caption =
        `🔞 *${src}*\n\n` +
        `🎬 *${title.slice(0, 100)}*\n` +
        (views      ? `👁️ ${views}   `       : '') +
        (duration   ? `⏱️ ${duration}   `     : '') +
        (rating     ? `⭐ ${rating}   `       : '') +
        (resolution ? `📺 ${resolution}\n`    : '\n') +
        `🔗 ${pick.pageUrl}${FOOTER}`;

      // ── 2. Try CDN preview clip (primary — fast, no yt-dlp) ──────────────
      if (pick.previewUrl) {
        await reply(`📥 _Fetching preview clip from ${src}..._`);
        try {
          const buf = await tryCdnPreview(pick.previewUrl, referer);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.warn(`[xv] CDN preview failed (${src}):`, e.message);

          // Try a different result from the other source
          const alt = pool.find(r => r._src !== pick._src && r.previewUrl);
          if (alt) {
            try {
              const altReferer = alt._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
              const altBuf     = await tryCdnPreview(alt.previewUrl, altReferer);
              const altCaption =
                `🔞 *${alt._src === 'xnxx' ? 'XNXX' : 'XVideos'}*\n\n` +
                `🎬 *${(alt.title || query).slice(0, 100)}*\n` +
                (alt.views    ? `👁️ ${alt.views}   ` : '') +
                (alt.duration ? `⏱️ ${alt.duration}\n` : '\n') +
                `🔗 ${alt.pageUrl}${FOOTER}`;
              await sock.sendMessage(jid, { video: altBuf, mimetype: 'video/mp4', caption: altCaption }, { quoted: msg });
              return await react('✅');
            } catch {}
          }
        }
      }

      // ── 3. Try cover thumbnail as fallback image ──────────────────────────
      if (pick.coverUrl) {
        try {
          const res = await axios.get(pick.coverUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA, 'Referer': referer },
            timeout: 15000,
          });
          const imgBuf = Buffer.from(res.data);
          if (imgBuf.length > 1000) {
            await sock.sendMessage(jid, {
              image:   imgBuf,
              caption: caption + '\n\n_⚠️ Preview unavailable — showing thumbnail_',
            }, { quoted: msg });
            return await react('✅');
          }
        } catch {}
      }

      // ── 4. yt-dlp full video download (last resort) ───────────────────────
      if (!pick.pageUrl) throw new Error('No video URL available — try different keywords');
      await reply(`📥 _Downloading full video via yt-dlp (30–120 sec)..._`);
      await fs.ensureDir(TEMP);
      const id = generateId();
      tmpFile  = path.join(TEMP, `xv_${id}.mp4`);
      const buf = await tryYtDlp(pick.pageUrl, tmpFile);
      await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
      await react('✅');

    } catch (err) {
      await react('❌');
      await reply(
        `❌ *Search Failed*\n\n_${(err.message || 'Unknown error').slice(0, 200)}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords (e.g. "cute" "asian" "hot")\n▸ Try again in a moment${FOOTER}`
      );
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
