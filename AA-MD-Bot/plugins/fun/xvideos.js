// ============================================
// AA MD Bot — XVideos Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// Search via DC /xxx/xvideos API → download via yt-dlp / Direct Stream
// Commands: .xv  .xvideos  .xvid  .xvideo
// ============================================

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { YTDLP, getCookiesArgs } from '../../lib/ytdlp.js';
import { generateId } from '../../lib/helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP      = path.join(__dirname, '../../temp');
const DC        = 'https://apis.davidcyriltech.my.id';
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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

      const results = apiRes?.data?.results || apiRes?.result || apiRes?.data || [];
      const list = Array.isArray(results) ? results : [];

      if (!list.length) throw new Error(`No results found for: "${query}"`);

      // Pick a random result from first 10 for variety
      const pick         = list[Math.floor(Math.random() * Math.min(list.length, 10))];
      const videoPageUrl = pick.url || pick.link;
      const directDlUrl  = pick.dl_url || pick.download || pick.video || null;
      const title        = pick.title || query;
      const duration     = pick.duration || '';
      const views        = pick.views || '';
      const thumb        = pick.thumbnail?.cover || pick.thumbnail || pick.thumb || null;

      if (!videoPageUrl && !directDlUrl) {
        throw new Error('Valid video URL not found in search results.');
      }

      await reply(`📥 _Downloading: ${title.slice(0, 60)}…_\n_This may take 30–60 seconds._`);

      fs.ensureDirSync(TEMP);
      const id = generateId();
      tmpFile  = path.join(TEMP, `xv_${id}.mp4`);

      // ── 2. Download Strategy ───────────────────────────────────────────────
      let isDownloaded = false;

      // Method A: Direct HTTP Download if API provided a direct stream link
      if (directDlUrl) {
        try {
          const res = await axios({
            method: 'get',
            url: directDlUrl,
            responseType: 'stream',
            headers: { 'User-Agent': UA },
            timeout: 60000,
          });

          const writer = fs.createWriteStream(tmpFile);
          res.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          if (fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 10000) {
            isDownloaded = true;
          }
        } catch {
          // Direct download failed, fallback to yt-dlp
        }
      }

      // Method B: Cleaned yt-dlp Execution
      if (!isDownloaded) {
        const { execFile } = await import('child_process');
        const execFileAsync = promisify(execFile);

        const cookies = getCookiesArgs();

        // Standardized and sanitized flags to prevent crashes
        const ytArgs = [
          '--no-check-certificate',
          '--user-agent', UA,
          '--referer', 'https://www.xvideos.com/',
          '-f', 'best[height<=480][ext=mp4]/best[height<=360]/best',
          '-o', tmpFile,
          '--no-playlist',
          '--no-warnings',
          ...cookies,
          videoPageUrl,
        ];

        await execFileAsync(YTDLP, ytArgs, { timeout: 120000 });
      }

      if (!fs.existsSync(tmpFile)) throw new Error('Download failed — file not created');

      const stat = fs.statSync(tmpFile);
      if (stat.size > MAX_BYTES)
        throw new Error(`Video too large (${Math.round(stat.size / 1024 / 1024)} MB). Try another search.`);
      if (stat.size < 10000)
        throw new Error('Download failed — file corrupted or empty');

      const buf = await fs.readFile(tmpFile);

      // ── 3. Send Message ────────────────────────────────────────────────────
      const caption =
        `🔞 *XVideos*\n\n` +
        `🎬 *${title.slice(0, 100)}*\n` +
        (views    ? `👁️ ${views}   ` : '') +
        (duration ? `⏱️ ${duration}\n` : '\n') +
        `🔗 ${videoPageUrl || 'XVideos'}${FOOTER}`;

      await sock.sendMessage(jid, {
        video:    buf,
        mimetype: 'video/mp4',
        fileName: `xvideos_${id}.mp4`,
        caption,
        ...(thumb ? {
          contextInfo: {
            externalAdReply: {
              title:                 title.slice(0, 80),
              body:                  views ? `${views} views` : 'XVideos',
              thumbnailUrl:          thumb,
              sourceUrl:             videoPageUrl || 'https://www.xvideos.com',
              mediaType:             2,
              renderLargerThumbnail: true,
            },
          },
        } : {}),
      }, { quoted: msg });

      await react('✅');

    } catch (err) {
      await react('❌');
      const cleanError = err.message?.replace(/Command failed:[\s\S]*/, 'yt-dlp execution error or video blocked.').slice(0, 120);
      await reply(
        `❌ *XVideos Failed*\n\n_${cleanError}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords\n▸ Try again in a moment${FOOTER}`
      );
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
