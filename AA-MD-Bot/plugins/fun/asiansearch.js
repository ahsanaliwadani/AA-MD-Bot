// ============================================
// AA MD Bot — Asian Content Search 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Search via DC /xxx/xvideos API (query prefixed with "asian")
// Strategy: try CDN preview clips across ALL results (no yt-dlp)
//           fallback to cover thumbnail image
// ============================================

import axios from 'axios';
const DC     = 'https://apis.davidcyriltech.my.id';
const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';
const REFERER = 'https://www.xvideos.com/';

// ── Download CDN preview clip ────────────────────────────────────────────────
async function fetchPreview(previewUrl) {
  const res = await axios.get(previewUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA, 'Referer': REFERER, 'Origin': 'https://www.xvideos.com' },
    timeout: 45000,
    maxContentLength: 40 * 1024 * 1024,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 5000) throw new Error('clip too small');
  return buf;
}

// ── Download cover image ─────────────────────────────────────────────────────
async function fetchCover(coverUrl) {
  const res = await axios.get(coverUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA, 'Referer': REFERER },
    timeout: 15000,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 1000) throw new Error('image too small');
  return buf;
}

export default {
  command:     'asian',
  alias:       ['asiansearch', 'asianvideo'],
  description: 'Search & send Asian content preview 🔞',
  category:    'fun',
  usage:       '.asian [search term]',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
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

    try {
      await reply(`🔍 _Searching for "${query}"..._`);

      // ── Search DC API ─────────────────────────────────────────────────────
      const { data: apiRes } = await axios.get(`${DC}/xxx/xvideos`, {
        params:  { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      const results = apiRes?.data?.results || apiRes?.results || [];
      if (!results.length) throw new Error(`No results for "${query}"`);

      // Separate results with preview clips
      const withPreview    = results.filter(r => r.thumbnail?.preview);
      const withoutPreview = results.filter(r => !r.thumbnail?.preview);
      const ordered        = [...withPreview, ...withoutPreview];

      // Shuffle top entries for variety
      const pool = ordered.slice(0, 20).sort(() => Math.random() - 0.5);

      // ── Try CDN preview clips (cycle through all with previews) ───────────
      for (const r of pool.filter(r => r.thumbnail?.preview)) {
        try {
          await react('📥');
          const previewUrl = r.thumbnail.preview;
          const buf        = await fetchPreview(previewUrl);
          const title      = (r.title || query).slice(0, 80);
          const caption    =
            `🔞 *Asian — ${title}*\n\n` +
            (r.views    ? `👁️ ${r.views}   ` : '') +
            (r.duration ? `⏱️ ${r.duration}\n` : '\n') +
            `🔗 ${r.url || ''}${FOOTER}`;
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      // ── All previews failed — try cover thumbnail ─────────────────────────
      for (const r of pool.filter(r => r.thumbnail?.cover)) {
        try {
          const coverUrl = r.thumbnail.cover;
          const buf      = await fetchCover(coverUrl);
          const title    = (r.title || query).slice(0, 80);
          const caption  =
            `🔞 *Asian — ${title}*\n\n` +
            (r.views    ? `👁️ ${r.views}   ` : '') +
            (r.duration ? `⏱️ ${r.duration}\n` : '\n') +
            `🔗 ${r.url || ''}\n\n_⚠️ Preview clip unavailable — thumbnail shown_${FOOTER}`;
          await sock.sendMessage(jid, { image: buf, caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      throw new Error('CDN links blocked — try different keywords or try again later.');

    } catch (e) {
      await react('❌');
      await reply(
        `❌ *Search Failed*\n\n_${(e.message || 'Unknown error').slice(0, 200)}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords (e.g. "cute" "cosplay")\n▸ Try again in a moment${FOOTER}`
      );
    }
  },
};
