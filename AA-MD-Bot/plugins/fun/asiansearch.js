// ============================================
// AA MD Bot — Asian Content Search 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Search via DC /xxx/xvideos API
// Downloads preview.mp4 from CDN (accessible from Replit)
// Falls back to yt-dlp if CDN preview unavailable
// ============================================

import axios      from 'axios';
import fs         from 'fs-extra';
import path       from 'path';
import { execFile }      from 'child_process';
import { promisify }     from 'util';
import { fileURLToPath } from 'url';
import { generateId }    from '../../lib/helper.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP  = path.join(__dirname, '../../temp');
const YTDLP = '/home/runner/.local/bin/yt-dlp';
const DC    = 'https://apis.davidcyriltech.my.id';
const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';

export default {
  command:     'asian',
  alias:       ['asiansearch', 'asianvideo'],
  description: 'Search & send Asian content preview 🔞',
  category:    'fun',
  usage:       '.asian [search term]',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
    // ── Self-chat only ────────────────────────────────────────────────────────
    if (!fromMe) return;

    if (text === undefined || text === null) {
      return reply(
        `🔞 *Asian Content Search*\n\n` +
        `*Usage:* ${prefix}asian <search>\n` +
        `*Examples:*\n` +
        `▸ ${prefix}asian\n` +
        `▸ ${prefix}asian cosplay\n` +
        `▸ ${prefix}asian cute\n\n` +
        `⚠️ _Adult content — 18+ only_${FOOTER}`
      );
    }

    const userQuery = (text || '').trim();
    const query     = userQuery ? `asian ${userQuery}` : 'asian';

    await react('🔞');
    let tmpFile = null;

    try {
      await reply(`🔍 _Searching for "${query}"..._`);

      // ── 1. Search via DC API ────────────────────────────────────────────────
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || apiRes?.results || [];
      if (!results.length) throw new Error(`No results found for: "${query}"`);

      // ── 2. Pick a random result ─────────────────────────────────────────────
      const pick     = results[Math.floor(Math.random() * Math.min(results.length, 10))];
      const title    = pick.title    || query;
      const duration = pick.duration || '';
      const views    = pick.views    || '';
      const previewUrl = pick.thumbnail?.preview || null; // short ~15s CDN clip
      const coverUrl   = pick.thumbnail?.cover   || null; // static image
      const pageUrl    = pick.url || '';

      const caption =
        `🔞 *Asian — ${title.slice(0, 80)}*\n\n` +
        (views    ? `👁️ ${views}   ` : '') +
        (duration ? `⏱️ ${duration}\n` : '\n') +
        `🔗 ${pageUrl}${FOOTER}`;

      // ── 3a. Try CDN preview.mp4 (small clip, fast) ─────────────────────────
      if (previewUrl) {
        await react('📥');
        let videoBuf = null;
        try {
          const res = await axios.get(previewUrl, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': UA,
              'Referer':    'https://www.xvideos.com/',
            },
            timeout: 30000,
            maxContentLength: 20 * 1024 * 1024,
          });
          videoBuf = Buffer.from(res.data);
        } catch (e) {
          console.warn('[asian] CDN preview download failed:', e.message);
        }

        if (videoBuf && videoBuf.length > 5000) {
          await sock.sendMessage(jid, {
            video:    videoBuf,
            mimetype: 'video/mp4',
            caption,
          }, { quoted: msg });
          await react('✅');
          return;
        }
      }

      // ── 3b. Try static cover image as buffer ───────────────────────────────
      if (coverUrl) {
        let imgBuf = null;
        try {
          const res = await axios.get(coverUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA, 'Referer': 'https://www.xvideos.com/' },
            timeout: 15000,
          });
          imgBuf = Buffer.from(res.data);
        } catch {}

        if (imgBuf && imgBuf.length > 1000) {
          await sock.sendMessage(jid, {
            image:   imgBuf,
            caption,
          }, { quoted: msg });
          await react('✅');
          return;
        }
      }

      // ── 3c. Full video download with yt-dlp ────────────────────────────────
      if (!pageUrl) throw new Error('No media URL found in result');

      await reply(`📥 _Downloading full video (may take 1–2 min)..._`);
      fs.ensureDirSync(TEMP);
      const id = generateId();
      tmpFile  = path.join(TEMP, `asian_${id}.mp4`);

      await execFileAsync(YTDLP, [
        '-f', 'b[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
        '--merge-output-format', 'mp4',
        '-o', tmpFile,
        '--no-playlist',
        '--max-filesize', '45m',
        '--no-warnings',
        '-N', '4',
        pageUrl,
      ], { timeout: 180_000 });

      if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size < 10000)
        throw new Error('Download failed — try different keywords');

      const buf = await fs.readFile(tmpFile);
      await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
      await react('✅');

    } catch (e) {
      await react('❌');
      await reply(`❌ *Search failed*\n\n${e.message}\n\nTry different keywords.${FOOTER}`);
    } finally {
      if (tmpFile) fs.remove(tmpFile).catch(() => {});
    }
  },
};
