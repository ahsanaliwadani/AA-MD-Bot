// ============================================
// AA MD Bot — XVideos Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// Search via DC /xxx/xvideos API → download via yt-dlp
// Commands: .xv  .xvideos  .xvid  .xvideo
// ============================================

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { YTDLP, YTDLP_FLAGS, getCookiesArgs } from '../../lib/ytdlp.js';
import { generateId } from '../../lib/helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP      = path.join(__dirname, '../../temp');
const DC        = 'https://apis.davidcyriltech.my.id';
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FOOTER    = '\n\n> 🔞 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';
const MAX_BYTES = 45 * 1024 * 1024; // 45 MB

export default {
  command:     'xv',
  alias:       ['xvideos', 'xvid', 'xvideo'],
  description: 'Search & send adult video from XVideos 🔞',
  category:    'fun',
  usage:       '.xv <search term>',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
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

      // ── 1. Search via DC API ───────────────────────────────────────────────
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || [];
      if (!results.length) throw new Error(`No results found for: "${query}"`);

      // Pick a random result from first 10 for variety
      const pick        = results[Math.floor(Math.random() * Math.min(results.length, 10))];
      const videoPageUrl = pick.url;
      const title        = pick.title    || query;
      const duration     = pick.duration || '';
      const views        = pick.views    || '';
      const thumb        = pick.thumbnail?.cover || null;

      await reply(`📥 _Downloading: ${title.slice(0, 60)}…_\n_This may take 30–60 seconds._`);

      // ── 2. Download via yt-dlp ─────────────────────────────────────────────
      fs.ensureDirSync(TEMP);
      const id  = generateId();
      tmpFile   = path.join(TEMP, `xv_${id}.mp4`);

      const { execFile } = await import('child_process');
      const execFileAsync = promisify(execFile);

      const ytArgs = [
        ...YTDLP_FLAGS.split(' ').filter(Boolean),
        ...getCookiesArgs(),
        '-f', 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=480]/best',
        '--merge-output-format', 'mp4',
        '-o', tmpFile,
        '--no-playlist',
        videoPageUrl,
      ];

      await execFileAsync(YTDLP, ytArgs, { timeout: 120000 });

      if (!fs.existsSync(tmpFile)) throw new Error('Download failed — file not created');

      const stat = fs.statSync(tmpFile);
      if (stat.size > MAX_BYTES)
        throw new Error(`Video too large (${Math.round(stat.size / 1024 / 1024)} MB). Try again.`);
      if (stat.size < 10000)
        throw new Error('Download failed — file too small (corrupted)');

      const buf = await fs.readFile(tmpFile);

      // ── 3. Send ────────────────────────────────────────────────────────────
      const caption =
        `🔞 *XVideos*\n\n` +
        `🎬 *${title.slice(0, 100)}*\n` +
        (views    ? `👁️ ${views}   ` : '') +
        (duration ? `⏱️ ${duration}\n` : '\n') +
        `🔗 ${videoPageUrl}${FOOTER}`;

      await sock.sendMessage(jid, {
        video:    buf,
        mimetype: 'video/mp4',
        fileName: `xvideos_${id}.mp4`,
        caption,
        ...(thumb ? {
          contextInfo: {
            externalAdReply: {
              title:                title.slice(0, 80),
              body:                 views ? `${views} views` : 'XVideos',
              thumbnailUrl:         thumb,
              sourceUrl:            videoPageUrl,
              mediaType:            2,
              renderLargerThumbnail: true,
            },
          },
        } : {}),
      }, { quoted: msg });

      await react('✅');

    } catch (err) {
      await react('❌');
      await reply(
        `❌ *XVideos Failed*\n\n_${err.message?.slice(0, 120)}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords\n▸ Try again in a moment${FOOTER}`
      );
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
