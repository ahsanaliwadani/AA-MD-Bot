// ============================================
// AA MD Bot — YouTube Search (.yts)
// Shows top results with channel, views, duration
// Primary:  play-dl (direct, no API key)
// Fallback: davidcyriltech /youtube/search
// ============================================
import axios from 'axios';

// ── Format views: 64908840 → "64.9M" ──────────────────────────────────────
function fmtViews(n) {
  if (n === undefined || n === null || n === '') return '—';
  let num = typeof n === 'string' ? Number(n.replace(/[^0-9.]/g, '')) : Number(n);
  if (!num || isNaN(num)) return typeof n === 'string' && n.trim() ? n : '—';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B views';
  if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1) + 'M views';
  if (num >= 1_000)         return (num / 1_000).toFixed(1) + 'K views';
  return num.toLocaleString() + ' views';
}

// ── Format seconds → "4:28" ───────────────────────────────────────────────
function fmtDur(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ── Relevance score: how many query words appear in title ─────────────────
function scoreMatch(title, query) {
  if (!title) return 0;
  const t = title.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return 0;
  return words.filter(w => t.includes(w)).length / words.length;
}

// ── Primary: play-dl search (no rate limit for searches, very fast) ───────
async function searchPlayDl(query, limit = 8) {
  const playdl = (await import('play-dl')).default;
  const res = await playdl.search(query, { source: { youtube: 'video' }, limit });
  if (!res?.length) return [];

  return res.map(v => ({
    title:     v.title || '',
    url:       v.url || '',
    channel:   v.channel?.name || '',
    duration:  fmtDur(v.durationInSec),
    views:     fmtViews(v.views),
    viewsRaw:  v.views || 0,
    thumbnail: v.thumbnails?.[0]?.url || '',
    score:     scoreMatch(v.title, query),
  }));
}

// ── Fallback: davidcyriltech API ──────────────────────────────────────────
async function searchDC(query, limit = 8) {
  const { data } = await axios.get(
    `https://apis.davidcyriltech.my.id/youtube/search`,
    { params: { query }, timeout: 15000 },
  );
  const items = data?.result || data?.results || data?.data || [];
  if (!Array.isArray(items) || !items.length) return [];

  return items.slice(0, limit).map(r => ({
    title:     r.title || '',
    url:       r.url || r.link || r.videoUrl || '',
    channel:   r.channel || r.channelTitle || r.author?.name || r.author || r.uploader || '',
    duration:  r.duration || r.timestamp || '—',
    views:     fmtViews(r.views || r.viewCount || r.view_count || null),
    viewsRaw:  Number(r.views || r.viewCount || 0),
    thumbnail: r.thumbnail || r.image || r.thumbnails?.[0]?.url || '',
    score:     scoreMatch(r.title, query),
  }));
}

export default {
  command: 'yts',
  alias: ['youtubesearch', 'ytsearch', 'ytsearchtop'],
  description: 'Search YouTube videos — shows channel, views, duration',
  category: 'search',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    const query = (text || '').trim();
    if (!query) {
      await react('❔');
      return reply(
        `🔍 *YouTube Search*\n\n` +
        `*Usage:* ${prefix}yts <search term>\n` +
        `*Example:* ${prefix}yts Arijit Singh Tum Hi Ho\n\n` +
        `> 🤖 *AA MD Bot*`,
      );
    }

    await react('🔎');

    let results = [];

    // Try play-dl first (faster, no external API needed)
    try {
      results = await searchPlayDl(query, 8);
    } catch (e) {
      console.error('[YTS] play-dl failed:', e.message);
    }

    // Fallback to DC API if play-dl returned nothing
    if (!results.length) {
      try {
        results = await searchDC(query, 8);
      } catch (e) {
        console.error('[YTS] DC API failed:', e.message);
      }
    }

    if (!results.length) {
      await react('❌');
      return reply(
        `❌ *No results found*\n\n` +
        `Couldn't find anything for: *${query}*\n\n` +
        `💡 Try different keywords or a shorter phrase.\n\n` +
        `> 🤖 *AA MD Bot*`,
      );
    }

    // Sort by relevance score (best match first), keep top 7
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, 7);

    // Build output text
    let txt =
      `🔍 *YouTube Search Results*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔎 Query: *${query}*\n` +
      `📋 Found: *${top.length}* videos\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n`;

    top.forEach((v, i) => {
      txt += `*${i + 1}.* ${v.title || 'Unknown'}\n`;
      if (v.channel) txt += `   📺 ${v.channel}\n`;
      txt += `   ⏱ ${v.duration}  👁 ${v.views}\n`;
      txt += `   🔗 ${v.url}\n\n`;
    });

    txt += `> 🤖 *AA MD Bot*`;

    // Send with thumbnail of first result if available
    const thumb = top[0]?.thumbnail;
    try {
      if (thumb) {
        await sock.sendMessage(jid, { image: { url: thumb }, caption: txt }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: txt }, { quoted: msg });
      }
      await react('✅');
    } catch (e) {
      console.error('[YTS] send failed:', e.message);
      await react('❌');
      reply(`❌ Failed to send results.\n\n${e.message}`);
    }
  },
};
