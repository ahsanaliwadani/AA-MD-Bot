// ============================================
// AA MD Bot — XVideos + XNXX + Eporner Search & Download 🔞
// Developer: Ahsan Ali | AA Mods
//
// SELF-CHAT ONLY — works only in owner's "You" chat
//
// Source priority:
//   1. Eporner.com  — public API + gvideo CDN (full videos, no scraping block)
//   2. XVideos      — DC search API + page scrape for CDN URL
//   3. XNXX         — DC search API + page scrape for CDN URL
//   4. Preview clip — DC thumbnail.preview (last resort, ~5s)
//   5. Cover image  — absolute last resort
// ============================================

import axios from 'axios';

const DC     = 'https://apis.davidcyriltech.my.id';
const FOOTER = '\n\n> 🔞 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// ── Eporner.com — free public API, returns real CDN MP4 via embed page ────────
async function searchEporner(query, limit = 10) {
  const { data } = await axios.get('https://www.eporner.com/api/v2/video/search/', {
    params: { query, per_page: limit, page: 1, order: 'top-rated', gay: 0, format: 'json' },
    headers: { 'User-Agent': UA },
    timeout: 12000,
  });
  const videos = data?.videos || [];
  return videos.map(v => ({
    title:      v.title || '',
    embedId:    v.id    || '',
    embedUrl:   v.embed || '',
    thumb:      v.default_thumb?.src || v.default_thumb || '',
    duration:   v.length_min || '',
    views:      v.views ? `${Number(v.views).toLocaleString()} views` : '',
    pageUrl:    v.url || `https://www.eporner.com/video-${v.id}/`,
    _src:       'eporner',
  }));
}

// ── Extract direct MP4 from eporner embed page ────────────────────────────────
// Eporner embed page has a URL like: https://gvideo.eporner.com/ID/ID.mp4
async function extractEpornerMp4(embedUrl, embedId) {
  const url = embedUrl || `https://www.eporner.com/embed/${embedId}/`;
  const { data: html } = await axios.get(url, {
    headers: HEADERS,
    timeout: 15000,
    maxRedirects: 5,
  });
  // Pattern: "https://gvideo.eporner.com/ID/ID.mp4" anywhere in the page
  const m = html.match(/["'](https?:\/\/[a-z0-9]+\.eporner\.com\/[^"']+\.mp4[^"']*)['"]/i);
  if (m?.[1]) return m[1];
  throw new Error('No MP4 URL found in eporner embed page');
}

// ── DC API: search XVideos ─────────────────────────────────────────────────────
async function searchXVideos(query, limit = 10) {
  const { data } = await axios.get(`${DC}/xxx/xvideos`, {
    params: { q: query },
    headers: { 'User-Agent': UA },
    timeout: 12000,
  });
  const results = data?.data?.results || data?.results || [];
  return results.slice(0, limit).map(r => ({
    title:      r.title || '',
    pageUrl:    r.url || '',
    previewUrl: r.thumbnail?.preview || null,
    coverUrl:   r.thumbnail?.cover   || null,
    duration:   r.duration || '',
    views:      r.views    || '',
    _src:       'xvideos',
  }));
}

// ── DC API: search XNXX ───────────────────────────────────────────────────────
async function searchXnxx(query, limit = 10) {
  const { data } = await axios.get(`${DC}/xxx/xnxx`, {
    params: { q: query },
    headers: { 'User-Agent': UA },
    timeout: 12000,
  });
  const results = data?.data?.results || data?.results || [];
  return results.slice(0, limit).map(r => ({
    title:      r.title || '',
    pageUrl:    r.url || r.link || '',
    previewUrl: r.thumbnail?.preview || null,
    coverUrl:   r.thumbnail?.cover   || null,
    duration:   r.duration || '',
    views:      r.views    || '',
    _src:       'xnxx',
  }));
}

// ── Scrape XVideos/XNXX page for direct MP4 URL ───────────────────────────────
async function scrapePageMp4(pageUrl, src) {
  const referer = src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
  const { data: html } = await axios.get(pageUrl, {
    headers: { ...HEADERS, Referer: referer },
    timeout: 15000,
    maxRedirects: 5,
  });
  if (typeof html !== 'string') throw new Error('Non-HTML response');

  // XVideos/XNXX html5player patterns
  const low  = html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/);
  const high = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/);
  if (low?.[1])  return { url: low[1],  quality: 'low' };
  if (high?.[1]) return { url: high[1], quality: 'high' };

  // XNXX alternate pattern
  const xn = html.match(/setVideoHigh\('([^']+)'\)/);
  if (xn?.[1]) return { url: xn[1], quality: 'high' };

  throw new Error('No direct MP4 URL found');
}

// ── Download buffer with size guard ──────────────────────────────────────────
async function downloadBuffer(url, referer, maxMB = 60, timeoutMs = 90000) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      ...HEADERS,
      Referer: referer || 'https://www.eporner.com/',
      Origin:  referer ? new URL(referer).origin : 'https://www.eporner.com',
    },
    timeout: timeoutMs,
    maxContentLength: maxMB * 1024 * 1024,
    maxRedirects: 10,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 20000) throw new Error('File too small — likely blocked or 404');
  return buf;
}

function makeCaption(r, query) {
  const srcLabel = r._src === 'xnxx' ? 'XNXX' : r._src === 'eporner' ? 'Eporner' : 'XVideos';
  const title    = (r.title || query).slice(0, 100);
  return (
    `🔞 *${srcLabel}*\n\n🎬 *${title}*\n` +
    (r.duration ? `⏱️ ${r.duration}   ` : '') +
    (r.views    ? `👁️ ${r.views}` : '') +
    `\n🔗 ${r.pageUrl || ''}${FOOTER}`
  );
}

export default {
  command:     'xv',
  alias:       ['xvideos', 'xvid', 'xvideo', 'xnxx', 'pornvideo', 'pv'],
  description: 'Search & send adult video (Eporner + XVideos + XNXX) 🔞',
  category:    'fun',
  usage:       '.xv <search term>',

  async execute({ sock, msg, jid, text, react, reply, prefix, fromMe }) {
    if (!fromMe) return;

    const query = (text || '').trim();
    if (!query) {
      return reply(
        `🔞 *Adult Video Search*\n\n` +
        `*Usage:* ${prefix}xv <search>\n\n` +
        `*Sources:* Eporner + XVideos + XNXX\n\n` +
        `*Examples:*\n▸ ${prefix}xv asian\n▸ ${prefix}xv romantic\n▸ ${prefix}xv cute girl\n\n` +
        `⚠️ _18+ only — self chat only_${FOOTER}`
      );
    }

    await react('🔞');
    await reply(`🔍 _Searching for "${query}"..._`);

    try {
      // ── Fetch all three sources in parallel ─────────────────────────────────
      const [epornerRes, xvRes, xnRes] = await Promise.allSettled([
        searchEporner(query, 12),
        searchXVideos(query, 8),
        searchXnxx(query, 8),
      ]);

      const epornerList = epornerRes.status === 'fulfilled' ? epornerRes.value : [];
      const xvList      = xvRes.status === 'fulfilled'      ? xvRes.value      : [];
      const xnList      = xnRes.status === 'fulfilled'      ? xnRes.value      : [];

      if (!epornerList.length && !xvList.length && !xnList.length) {
        throw new Error(`No results found for "${query}"`);
      }

      // Shuffle each list for variety, then interleave eporner first
      const shuffle = arr => arr.sort(() => Math.random() - 0.5);
      const pool = [
        ...shuffle(epornerList).slice(0, 8),
        ...shuffle(xvList).slice(0, 5),
        ...shuffle(xnList).slice(0, 5),
      ];

      // ── PASS 1: Eporner embed → gvideo CDN MP4 (full video, no block) ───────
      for (const r of pool.filter(r => r._src === 'eporner' && r.embedUrl)) {
        try {
          await react('📥');
          const mp4Url = await extractEpornerMp4(r.embedUrl, r.embedId);
          const buf    = await downloadBuffer(mp4Url, 'https://www.eporner.com/', 60, 100000);
          const caption = makeCaption(r, query);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.error('[xv eporner]', e.message);
        }
      }

      // ── PASS 2: XVideos/XNXX page scrape → CDN MP4 ──────────────────────────
      for (const r of pool.filter(r => r._src !== 'eporner' && r.pageUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          await react('📥');
          const { url: mp4Url } = await scrapePageMp4(r.pageUrl, r._src);
          const buf = await downloadBuffer(mp4Url, referer, 60, 100000);
          const caption = makeCaption(r, query);
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch (e) {
          console.error('[xv scrape]', e.message);
        }
      }

      // ── PASS 3: CDN preview clips (short ~5-15s clips from DC API) ───────────
      for (const r of pool.filter(r => r.previewUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          await react('📥');
          const buf = await downloadBuffer(r.previewUrl, referer, 20, 30000);
          const caption = makeCaption(r, query) + '\n\n_⚠️ Preview clip — open link for full video_';
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      // ── PASS 4: Eporner thumbnail (image fallback) ───────────────────────────
      for (const r of pool.filter(r => r._src === 'eporner' && r.thumb)) {
        try {
          const buf = await downloadBuffer(r.thumb, 'https://www.eporner.com/', 5, 15000);
          const caption = makeCaption(r, query) + '\n\n_📸 Thumbnail — open link above to watch full video_';
          await sock.sendMessage(jid, { image: buf, caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      // ── PASS 5: XVideos cover image fallback ─────────────────────────────────
      for (const r of pool.filter(r => r.coverUrl)) {
        const referer = r._src === 'xnxx' ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
        try {
          const buf = await downloadBuffer(r.coverUrl, referer, 5, 15000);
          const caption = makeCaption(r, query) + '\n\n_📸 Thumbnail — open link above to watch full video_';
          await sock.sendMessage(jid, { image: buf, caption }, { quoted: msg });
          return await react('✅');
        } catch {}
      }

      throw new Error('All download attempts failed. Try different keywords or try again later.');

    } catch (err) {
      await react('❌');
      await reply(
        `❌ *Search Failed*\n\n_${(err.message || 'Unknown error').slice(0, 200)}_\n\n` +
        `💡 *Try:* simpler keywords like "cute" "hot" "romantic" "asian"${FOOTER}`
      );
    }
  },
};
