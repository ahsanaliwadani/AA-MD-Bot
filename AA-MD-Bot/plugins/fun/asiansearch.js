// ============================================
// AA MD Bot — Asian Content Search 🔞
// Developer: Ahsan Ali | AA Mods
//
// Uses DC /xxx/xvideos API (42k+ asian results)
// Sends preview.mp4 clip (~130KB, publicly accessible)
// ============================================

import axios from 'axios';

const DC     = 'https://apis.davidcyriltech.my.id';
const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';

export default {
  command:     'asian',
  alias:       ['asiansearch', 'asianvideo', 'asiandl', 'asiantolick'],
  description: 'Search & send Asian content preview 🔞',
  category:    'fun',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    const userQuery = (text || '').trim();

    // Show usage only when command sent with no args at all
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

    // Build query — append "asian" if user gave extra keywords, else just "asian"
    const query = userQuery ? `asian ${userQuery}` : 'asian';

    await react('🔞');

    try {
      // ── Search via DC xvideos API (42,000+ asian results) ─────────────────
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || [];
      if (!results.length) throw new Error(`No results found for: "${query}"`);

      // Pick a random result from first 10 for variety
      const pick       = results[Math.floor(Math.random() * Math.min(results.length, 10))];
      const title      = pick.title    || query;
      const duration   = pick.duration || '';
      const views      = pick.views    || '';
      const previewUrl = pick.thumbnail?.preview || null; // short mp4 clip ~130KB
      const coverUrl   = pick.thumbnail?.cover   || null; // still image
      const pageUrl    = pick.url || '';

      const caption =
        `🔞 *Asian — ${title.slice(0, 80)}*\n\n` +
        (views    ? `👁️ ${views}   ` : '') +
        (duration ? `⏱️ ${duration}\n` : '\n') +
        `🔗 ${pageUrl}${FOOTER}`;

      const ctxInfo = coverUrl ? {
        contextInfo: {
          externalAdReply: {
            title:                title.slice(0, 80),
            body:                 views ? `${views} views` : 'Asian Content',
            thumbnailUrl:         coverUrl,
            sourceUrl:            pageUrl,
            mediaType:            2,
            renderLargerThumbnail: true,
          },
        },
      } : {};

      if (previewUrl) {
        // Preview.mp4 is a short clip served publicly from xvideos CDN (~130KB)
        await sock.sendMessage(jid, {
          video:    { url: previewUrl },
          mimetype: 'video/mp4',
          caption,
          ...ctxInfo,
        }, { quoted: msg });
        await react('✅');
      } else if (coverUrl) {
        // Fallback: send thumbnail image if no preview video
        await sock.sendMessage(jid, {
          image:   { url: coverUrl },
          caption,
        }, { quoted: msg });
        await react('✅');
      } else {
        throw new Error('No media URL found in result');
      }

    } catch (e) {
      await react('❌');
      await reply(`❌ *Search failed*\n\n${e.message}\n\nTry different keywords.${FOOTER}`);
    }
  },
};
