// ============================================
// AA MD Bot — XVideos Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// Search via DC /xxx/xvideos API
// Download via direct HTML scraping (no yt-dlp — blocked from Replit IP)
// Commands: .xv  .xvideos  .xvid  .xvideo
// ============================================

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateId } from '../../lib/helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP      = path.join(__dirname, '../../temp');
const DC        = 'https://apis.davidcyriltech.my.id';
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FOOTER    = '\n\n> 🔞 *AA MD Bot* •  👨‍💻 *Ahsan Ali Wadani*';
const MAX_BYTES = 45 * 1024 * 1024; // 45 MB

// ── Extract direct MP4 URL from XVideos page HTML ──────────────────────────
// XVideos embeds the video URL in JavaScript on the page:
//   html5player.setVideoUrlHigh('https://cdn.../video_360p.mp4?secure=...')
//   html5player.setVideoUrl720p('https://cdn.../video_720p.mp4?secure=...')
async function getDirectVideoUrl(pageUrl) {
  const html = await axios.get(pageUrl, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.xvideos.com/',
    },
    timeout: 25000,
  }).then(r => r.data);

  // Try highest quality first, then fall to lower
  const patterns = [
    /html5player\.setVideoUrl1080p\('([^']+)'\)/,
    /html5player\.setVideoUrl720p\('([^']+)'\)/,
    /html5player\.setVideoUrlHigh\('([^']+)'\)/,
    /html5player\.setVideoUrlLow\('([^']+)'\)/,
    /html5player\.setVideoUrl\('([^']+)'\)/,
    /"videoUrl":"([^"]+\.mp4[^"]*)"/,
    /setVideoHLS_cdn\('([^']+)'\)/,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] && m[1].startsWith('http')) return m[1];
  }
  throw new Error('Could not extract video URL from page');
}

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

      // ── 1. Search via DC API ────────────────────────────────────────────────
      let results = [];
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      }).catch(async () => {
        // fallback API
        return axios.get(`https://api.guru/xxx/xvideos`, {
          params: { q: query },
          headers: { 'User-Agent': UA },
          timeout: 20000,
        }).catch(() => ({ data: null }));
      });

      results = apiRes?.data?.results || apiRes?.results || apiRes?.data || [];
      const list = Array.isArray(results) ? results : [];
      if (!list.length) throw new Error(`No results found for: "${query}"`);

      // Pick a random result from top 10
      const pick         = list[Math.floor(Math.random() * Math.min(list.length, 10))];
      const videoPageUrl = pick.url || pick.link;
      const title        = pick.title || query;
      const duration     = pick.duration || '';
      const views        = pick.views || '';
      const thumb = typeof pick.thumbnail === 'object'
        ? (pick.thumbnail?.cover || pick.thumbnail?.preview)
        : (pick.thumbnail || null);

      if (!videoPageUrl) throw new Error('Video URL not found in API response.');

      await reply(`📥 _Downloading: ${title.slice(0, 60)}…_\n_Please wait 30–60 seconds._`);

      // ── 2. Extract direct MP4 URL from page HTML ────────────────────────────
      const directUrl = await getDirectVideoUrl(videoPageUrl);

      // ── 3. Download video buffer ────────────────────────────────────────────
      fs.ensureDirSync(TEMP);
      const id = generateId();
      tmpFile  = path.join(TEMP, `xv_${id}.mp4`);

      const videoRes = await axios.get(directUrl, {
        responseType: 'stream',
        headers: {
          'User-Agent': UA,
          'Referer': 'https://www.xvideos.com/',
        },
        timeout: 120000,
        maxContentLength: MAX_BYTES + 1,
      });

      const writer = fs.createWriteStream(tmpFile);
      await new Promise((resolve, reject) => {
        videoRes.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        videoRes.data.on('error', reject);
      });

      if (!fs.existsSync(tmpFile)) throw new Error('Download failed — file not created');
      const stat = fs.statSync(tmpFile);
      if (stat.size > MAX_BYTES)
        throw new Error(`Video too large (${Math.round(stat.size / 1024 / 1024)} MB). Try another search.`);
      if (stat.size < 10000)
        throw new Error('Download failed — file too small (corrupted)');

      const buf = await fs.readFile(tmpFile);

      // ── 4. Send video ────────────────────────────────────────────────────────
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
              title:                 title.slice(0, 80),
              body:                  views ? `${views} views` : 'XVideos',
              thumbnailUrl:          thumb,
              sourceUrl:             videoPageUrl,
              mediaType:             2,
              renderLargerThumbnail: true,
            },
          },
        } : {}),
      }, { quoted: msg });

      await react('✅');

    } catch (err) {
      await react('❌');
      const msg2 = (err.message || 'Unknown error').slice(0, 150);
      await reply(
        `❌ *XVideos Failed*\n\n_${msg2}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords\n▸ Try again in a moment${FOOTER}`
      );
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
