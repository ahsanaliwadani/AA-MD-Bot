// ============================================
// AA MD Bot — Asian Content Search 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Search via DC /xxx/xvideos API
// Method 1: CDN preview.mp4 (fast ~15s clip, confirmed working)
// Method 2: cover image thumbnail
// Method 3: yt-dlp full video fallback
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
const TEMP  = path.join(__dirname, '../../temp');
const DC    = 'https://apis.davidcyriltech.my.id';
const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

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
  if (!buf.length || buf.length < 5000) throw new Error('too small');
  return buf;
}

export default {
  command:     'asian',
  alias:       ['asiansearch', 'asianvideo'],
  description: 'Search & send Asian content preview 🔞',
  category:    'fun',
  usage:       '.asian [search term]',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
    // ── Self-chat only ──────────────────────────────────────────────────────
    if (!fromMe) return;

    if (text === undefined || text === null) {
      return reply(
        `🔞 *Asian Content Search*\n\n` +
        `*Usage:* ${prefix}asian <search>\n` +
        `*Examples:*\n▸ ${prefix}asian\n▸ ${prefix}asian cosplay\n▸ ${prefix}asian cute\n\n` +
        `⚠️ _Adult content — 18+ only_${FOOTER}`
      );
    }

    const userQuery = (text || '').trim();
    const query     = userQuery ? `asian ${userQuery}` : 'asian';
    await react('🔞');
    let tmpFile = null;

    try {
      await reply(`🔍 _Searching for "${query}"..._`);

      // ── 1. Search via DC API ──────────────────────────────────────────────
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || apiRes?.results || [];
      if (!results.length) throw new Error(`No results for "${query}"`);

      const pick       = results[Math.floor(Math.random() * Math.min(results.length, 10))];
      const title      = pick.title    || query;
      const duration   = pick.duration || '';
      const views      = pick.views    || '';
      const previewUrl = pick.thumbnail?.preview || null;
      const coverUrl   = pick.thumbnail?.cover   || null;
      const pageUrl    = pick.url || '';

      const caption =
        `🔞 *Asian — ${title.slice(0, 80)}*\n\n` +
        (views    ? `👁️ ${views}   ` : '') +
        (duration ? `⏱️ ${duration}\n` : '\n') +
        `🔗 ${pageUrl}${FOOTER}`;

      // ── 2. Try CDN preview clip (fastest, no yt-dlp) ─────────────────────
      if (previewUrl) {
        await react('📥');
        try {
          const buf = await tryCdnPreview(previewUrl);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.warn('[asian] CDN preview failed:', e.message);
        }
      }

      // ── 3. Try cover thumbnail as image ──────────────────────────────────
      if (coverUrl) {
        try {
          const res = await axios.get(coverUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA, 'Referer': 'https://www.xvideos.com/' },
            timeout: 15000,
          });
          const imgBuf = Buffer.from(res.data);
          if (imgBuf.length > 1000) {
            await sock.sendMessage(jid, { image: imgBuf, caption }, { quoted: msg });
            return await react('✅');
          }
        } catch {}
      }

      // ── 4. Full video via yt-dlp ──────────────────────────────────────────
      if (!pageUrl) throw new Error('No media URL — try different keywords');
      await reply(`📥 _Downloading full video (may take 1–2 min)..._`);
      await fs.ensureDir(TEMP);
      const id = generateId();
      tmpFile  = path.join(TEMP, `asian_${id}.mp4`);

      const ytdlp = findYtDlp();
      await execFileAsync(ytdlp, [
        '-f', 'b[ext=mp4][filesize<45M]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', tmpFile,
        '--no-playlist', '--no-warnings',
        '--socket-timeout', '30', '--retries', '3',
        '-N', '4',
        '--add-header', 'Referer:https://www.xvideos.com/',
        pageUrl,
      ], { timeout: 180_000 });

      if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size < 10_000)
        throw new Error('yt-dlp download failed — try different keywords');

      const buf = await fs.readFile(tmpFile);
      await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
      await react('✅');

    } catch (e) {
      await react('❌');
      await reply(`❌ *Search failed*\n\n_${e.message}_\n\nTry different keywords.${FOOTER}`);
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
