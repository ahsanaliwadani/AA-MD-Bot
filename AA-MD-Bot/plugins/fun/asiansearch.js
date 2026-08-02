// ============================================
// AA MD Bot — Asian Content Search 🔞
// Developer: Ahsan Ali | AA Mods
//
// Uses DC /xxx/xvideos API (42k+ asian results)
// Downloads preview.mp4 clip as buffer (CDN URLs blocked by Baileys)
// ============================================

import axios from 'axios';

const DC     = 'https://apis.davidcyriltech.my.id';
const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';
const MAX_VID = 15 * 1024 * 1024; // 15 MB cap for preview clips

export default {
  command:     'asian',
  alias:       ['asiansearch', 'asianvideo', 'asiandl', 'asiantolick'],
  description: 'Search & send Asian content preview 🔞',
  category:    'fun',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    const userQuery = (text || '').trim();

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

    const query = userQuery ? `asian ${userQuery}` : 'asian';

    await react('🔞');

    try {
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || apiRes?.results || [];
      if (!results.length) throw new Error(`No results found for: "${query}"`);

      const pick     = results[Math.floor(Math.random() * Math.min(results.length, 10))];
      const title    = pick.title    || query;
      const duration = pick.duration || '';
      const views    = pick.views    || '';

      // Both thumbnail fields
      const previewUrl = pick.thumbnail?.preview || null; // short mp4 clip
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
        // Download the preview clip as a buffer — XVideos CDN blocks Baileys fetch
        await react('📥');
        let videoBuf = null;
        try {
          const res = await axios.get(previewUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA, 'Referer': 'https://www.xvideos.com/' },
            timeout: 30000,
            maxContentLength: MAX_VID,
          });
          videoBuf = Buffer.from(res.data);
        } catch (dlErr) {
          console.warn('[asian] preview download failed:', dlErr.message);
        }

        if (videoBuf && videoBuf.length > 5000) {
          await sock.sendMessage(jid, {
            video:    videoBuf,
            mimetype: 'video/mp4',
            caption,
            ...ctxInfo,
          }, { quoted: msg });
        } else if (coverUrl) {
          // Preview failed — fallback to cover image
          await sock.sendMessage(jid, {
            image:   { url: coverUrl },
            caption,
          }, { quoted: msg });
        } else {
          throw new Error('Could not download media from CDN');
        }
        await react('✅');
      } else if (coverUrl) {
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
