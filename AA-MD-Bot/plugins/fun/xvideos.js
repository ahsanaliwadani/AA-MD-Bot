// ============================================
// AA MD Bot — XVideos + XNXX Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Sources: DC xvideos API + DC xnxx API
// Strategy: try CDN preview clips across ALL results (no yt-dlp)
//           fallback to cover thumbnail image
// ============================================

import axios from 'axios';
const DC     = 'https://apis.davidcyriltech.my.id';
const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// ── Search both APIs ────────────────────────────────────────────────────────
async function searchVideos(query) {
  const [xvRes, xnRes] = await Promise.allSettled([
    axios.get(`${DC}/xxx/xvideos`, { params: { q: query }, headers: { 'User-Agent': UA }, timeout: 15000 }),
    axios.get(`${DC}/xxx/xnxx`,    { params: { q: query }, headers: { 'User-Agent': UA }, timeout: 15000 }),
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

  // Interleave both — previews first
  const all = [...xvResults, ...xnResults];
  return [...all.filter(r => r.previewUrl), ...all.filter(r => !r.previewUrl)];
}

// ── Download CDN preview clip ────────────────────────────────────────────────
async function fetchPreview(previewUrl, referer) {
  const res = await axios.get(previewUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA, 'Referer': referer, 'Origin': new URL(referer).origin },
    timeout: 45000,
    maxContentLength: 40 * 1024 * 1024,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 10000) throw new Error('clip too small');
  return buf;
}

// ── Download cover image ─────────────────────────────────────────────────────
async function fetchCover(coverUrl, referer) {
  const res = await axios.get(coverUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': UA, 'Referer': referer },
    timeout: 15000,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 1000) throw new Error('image too small');
  return buf;
}

function makeCaption(r, query) {
  const src      = r._src === 'xnxx' ? 'XNXX' : 'XVideos';
  const title    = (r.title || query).slice(0, 100);
  const views    = r.views    || '';
  const duration = r.duration || '';
  const rating   = r.rating   || '';
  return (
    `🔞 *${src}*\n\n🎬 *${title}*\n` +
    (views    ? `👁️ ${views}   ` : '') +
    (duration ? `⏱️ ${duration}   ` : '') +
    (rating   ? `⭐ ${rating}` : '') +
    `\n🔗 ${r.pageUrl}${FOOTER}`
  );
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
        `*Sources:* XVideos + XNXX\n\n` +
        `*Examples:*\n▸ ${prefix}xv asian\n▸ ${prefix}xv romantic\n▸ ${prefix}xv cute girl\n\n` +
        `⚠️ _18+ only — self chat only_${FOOTER}`
      );
    }

    await react('🔞');

    try {
      await reply(`🔍 _Searching XVideos + XNXX for "${query}"..._`);
      const results = await searchVideos(query);
      if (!results.length) throw new Error(`No results found for "${query}"`);

      const pool = results.slice(0, 20);
      // Shuffle top results for variety
      const shuffled = pool.sort(() => Math.random() - 0.5);

      // ── Try CDN preview clips across multiple results ─────────────────────
      for (const r of shuffled.filter(r => r.previewUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          await react('📥');
          const buf = await fetchPreview(r.previewUrl, referer);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: makeCaption(r, query) }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      // ── All previews failed — try cover image ─────────────────────────────
      for (const r of shuffled.filter(r => r.coverUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          const buf = await fetchCover(r.coverUrl, referer);
          await sock.sendMessage(jid, {
            image:   buf,
            caption: makeCaption(r, query) + '\n\n_⚠️ Preview clip unavailable — thumbnail shown_',
          }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      throw new Error('Could not fetch any media — all CDN links blocked. Try different keywords.');

    } catch (err) {
      await react('❌');
      await reply(
        `❌ *Search Failed*\n\n_${(err.message || 'Unknown error').slice(0, 200)}_\n\n` +
        `💡 *Tips:*\n▸ Try simpler keywords (e.g. "cute" "asian" "hot")\n▸ Try again in a moment${FOOTER}`
      );
    }
  },
};
