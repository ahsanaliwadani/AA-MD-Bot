// ============================================
// AA MD Bot — XVideos + XNXX Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
// Strategy:
//   1. DC search API → get page URLs
//   2. Scrape xvideos/xnxx page → extract direct CDN MP4 URL
//   3. Download MP4 directly (no yt-dlp)
//   4. Fallback: CDN preview clip
//   5. Final fallback: cover thumbnail
// ============================================

import axios from 'axios';

const DC     = 'https://apis.davidcyriltech.my.id';
const FOOTER = '\n\n> 🔞 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

const HEADERS_BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// ── Search both APIs ──────────────────────────────────────────────────────────
async function searchVideos(query) {
  const [xvRes, xnRes] = await Promise.allSettled([
    axios.get(`${DC}/xxx/xvideos`, { params: { q: query }, headers: { 'User-Agent': HEADERS_BROWSER['User-Agent'] }, timeout: 15000 }),
    axios.get(`${DC}/xxx/xnxx`,    { params: { q: query }, headers: { 'User-Agent': HEADERS_BROWSER['User-Agent'] }, timeout: 15000 }),
  ]);

  const pick = (res, src) => {
    if (res.status !== 'fulfilled') return [];
    const d = res.value.data;
    return (d?.data?.results || d?.results || []).map(r => ({
      ...r,
      _src:       src,
      previewUrl: r.thumbnail?.preview || null,
      coverUrl:   r.thumbnail?.cover   || null,
      pageUrl:    r.url || r.link || '',
    }));
  };

  const all = [...pick(xvRes, 'xvideos'), ...pick(xnRes, 'xnxx')];
  // Put results with page URLs first
  return [...all.filter(r => r.pageUrl), ...all.filter(r => !r.pageUrl)];
}

// ── Scrape page and extract direct MP4 URL ────────────────────────────────────
async function extractMp4(pageUrl, src) {
  const referer = src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';

  const { data: html } = await axios.get(pageUrl, {
    headers: { ...HEADERS_BROWSER, Referer: referer },
    timeout: 15000,
    maxRedirects: 5,
  });

  if (typeof html !== 'string') throw new Error('Non-HTML response');

  // Try low quality first (smaller file), then high
  const lowMatch  = html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/);
  const highMatch = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/);

  if (lowMatch?.[1])  return { url: lowMatch[1],  quality: 'low' };
  if (highMatch?.[1]) return { url: highMatch[1], quality: 'high' };

  throw new Error('No direct MP4 URL found in page');
}

// ── Download a video/image buffer with size guard ─────────────────────────────
async function downloadBuffer(url, referer, maxMB = 50, timeoutMs = 90000) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      ...HEADERS_BROWSER,
      Referer: referer,
      Origin:  new URL(referer).origin,
    },
    timeout: timeoutMs,
    maxContentLength: maxMB * 1024 * 1024,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 10000) throw new Error('Downloaded file too small — likely blocked');
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
    `\n🔗 ${r.pageUrl || ''}${FOOTER}`
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
    await reply(`🔍 _Searching XVideos + XNXX for "${query}"..._`);

    try {
      const results = await searchVideos(query);
      if (!results.length) throw new Error(`No results found for "${query}"`);

      // Shuffle top pool for variety
      const pool = results.slice(0, 20).sort(() => Math.random() - 0.5);

      // ── PASS 1: Scrape page → direct MP4 CDN URL ───────────────────────────
      for (const r of pool.filter(r => r.pageUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          await react('📥');
          const { url: mp4Url } = await extractMp4(r.pageUrl, r._src);
          const buf = await downloadBuffer(mp4Url, referer, 50, 90000);
          const caption = makeCaption(r, query);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch { /* try next */ }
      }

      // ── PASS 2: CDN preview clips (short but better than nothing) ──────────
      for (const r of pool.filter(r => r.previewUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          await react('📥');
          const buf = await downloadBuffer(r.previewUrl, referer, 20, 30000);
          const caption = makeCaption(r, query) + '\n\n_⚠️ Preview clip — full video: tap link above_';
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      // ── PASS 3: Cover image fallback ────────────────────────────────────────
      for (const r of pool.filter(r => r.coverUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          const buf = await downloadBuffer(r.coverUrl, referer, 5, 15000);
          const caption = makeCaption(r, query) + '\n\n_📸 Thumbnail only — open link above to watch_';
          await sock.sendMessage(jid, { image: buf, caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      throw new Error('All download attempts failed — CDN may be blocking. Try different keywords.');

    } catch (err) {
      await react('❌');
      await reply(
        `❌ *Search Failed*\n\n_${(err.message || 'Unknown error').slice(0, 200)}_\n\n` +
        `💡 *Try:* simpler keywords like "cute" "hot" "romantic"${FOOTER}`
      );
    }
  },
};
