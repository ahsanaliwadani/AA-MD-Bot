// ============================================
// AA MD Bot — XVideos Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Search via DC /xxx/xvideos API
// Download via yt-dlp (handles HLS→mp4 natively)
// Commands: .xv  .xvideos  .xvid  .xvideo
// ============================================

import axios      from 'axios';
import fs         from 'fs-extra';
import path       from 'path';
import { execFile }        from 'child_process';
import { promisify }       from 'util';
import { fileURLToPath }   from 'url';
import { generateId }      from '../../lib/helper.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP      = path.join(__dirname, '../../temp');
const YTDLP     = '/home/runner/.local/bin/yt-dlp';
const DC        = 'https://apis.davidcyriltech.my.id';
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FOOTER    = '\n\n> 🔞 *AA MD Bot* •  👨‍💻 *Ahsan Ali Wadani*';
const MAX_BYTES = 45 * 1024 * 1024; // 45 MB

export default {
  command:     'xv',
  alias:       ['xvideos', 'xvid', 'xvideo'],
  description: 'Search & send adult video from XVideos 🔞',
  category:    'fun',
  usage:       '.xv <search term>',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
    // ── Self-chat only ────────────────────────────────────────────────────────
    if (!fromMe) return;

    const query = (text || '').trim();
    if (!query) {
      return reply(
        `🔞 *XVideos Downloader*\n\n` +
        `*Usage:* ${prefix}xv <search>\n` +
        `*Examples:*\n` +
        `▸ ${prefix}xv asian\n` +
        `▸ ${prefix}xv cute\n` +
        `▸ ${prefix}xv romantic\n\n` +
        `⚠️ _Adult content — 18+ only_${FOOTER}`
      );
    }

    await react('🔞');
    let tmpFile = null;

    try {
      await reply(`🔍 _Searching XVideos for "${query}"..._`);

      // ── 1. Search via DC API ────────────────────────────────────────────────
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || apiRes?.results || apiRes?.data || [];
      if (!Array.isArray(results) || !results.length)
        throw new Error(`No results found for: "${query}"`);

      // ── 2. Pick a random result from top 10 ────────────────────────────────
      const pool = results.slice(0, Math.min(results.length, 10));
      const pick = pool[Math.floor(Math.random() * pool.length)];

      const pageUrl  = pick.url || pick.link;
      if (!pageUrl)  throw new Error('No video page URL in result');

      const title    = pick.title    || query;
      const duration = pick.duration || '';
      const views    = pick.views    || '';
      const thumb    = typeof pick.thumbnail === 'object'
        ? (pick.thumbnail?.cover || pick.thumbnail?.preview)
        : (pick.thumbnail || null);

      await reply(`📥 _Downloading: ${title.slice(0, 60)}…_\n_Please wait 30–90 seconds._`);

      // ── 3. Download with yt-dlp ─────────────────────────────────────────────
      fs.ensureDirSync(TEMP);
      const id    = generateId();
      tmpFile     = path.join(TEMP, `xv_${id}.mp4`);

      await execFileAsync(YTDLP, [
        '-f', 'b[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
        '--merge-output-format', 'mp4',
        '-o', tmpFile,
        '--no-playlist',
        '--max-filesize', '45m',
        '--no-warnings',
        '--socket-timeout', '30',
        '-N', '4',              // 4 parallel fragments for speed
        pageUrl,
      ], { timeout: 180_000 });

      if (!fs.existsSync(tmpFile)) throw new Error('Download failed — yt-dlp produced no file');
      const stat = fs.statSync(tmpFile);
      if (stat.size > MAX_BYTES)
        throw new Error(`File too large (${Math.round(stat.size / 1048576)}MB). Try another search.`);
      if (stat.size < 10000)
        throw new Error('File too small / corrupted. Try another search.');

      const buf = await fs.readFile(tmpFile);

      // ── 4. Send video ────────────────────────────────────────────────────────
      const caption =
        `🔞 *XVideos*\n\n` +
        `🎬 *${title.slice(0, 100)}*\n` +
        (views    ? `👁️ ${views}   ` : '') +
        (duration ? `⏱️ ${duration}\n` : '\n') +
        `🔗 ${pageUrl}${FOOTER}`;

      await sock.sendMessage(jid, {
        video:    buf,
        mimetype: 'video/mp4',
        caption,
        ...(thumb ? {
          contextInfo: {
            externalAdReply: {
              title:                 title.slice(0, 80),
              body:                  views ? `${views} views` : 'XVideos',
              thumbnailUrl:          thumb,
              sourceUrl:             pageUrl,
              mediaType:             2,
              renderLargerThumbnail: true,
            },
          },
        } : {}),
      }, { quoted: msg });

      await react('✅');

    } catch (err) {
      await react('❌');
      const errMsg = (err.message || 'Unknown error').slice(0, 200);
      await reply(
        `❌ *XVideos Failed*\n\n_${errMsg}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords\n▸ Try again in a moment${FOOTER}`
      );
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
