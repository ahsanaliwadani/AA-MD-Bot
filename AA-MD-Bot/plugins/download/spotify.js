// ============================================
// AA MD Bot - Spotify Downloader
// Developer: Ahsan Ali | AA Mods
//
// Commands:
//   .spotify <song name or Spotify URL>
//   .spot <...>
//   .spoti <...>
//   .spt <...>
//   .spotifydl <...>
//
// Flow:
//   1. ootaizumi API (user-provided, query-based)
//   2. If Spotify URL → scrape og: meta → YouTube search → audio APIs
//   3. If name search → YouTube search → audio APIs (davidcyriltech / eliteprotech)
// ============================================

import axios             from 'axios';
import path              from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOOTER    = '\n\n> 🎵 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';
const SP_RX     = /https?:\/\/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i;
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const api       = axios.create({ timeout: 20000, headers: { 'User-Agent': UA } });

// ── Method 1: ootaizumi API (user-provided) ───────────────────────────────────
async function tryOotaizumi(query) {
  const { data } = await api.get(
    `https://api.ootaizumi.web.id/downloader/spotifyplay?query=${encodeURIComponent(query)}`
  );
  if (!data?.status || !data?.result?.download) throw new Error('ootaizumi: no download URL');
  const s = data.result;
  return {
    title:    s.title   || query,
    artist:   s.artists || s.artist || 'Unknown',
    audioUrl: s.download,
    image:    s.image   || s.cover  || null,
    source:   'ootaizumi',
  };
}

// ── Method 2: Scrape Spotify metadata from og: tags ───────────────────────────
async function getSpotifyMeta(trackId) {
  const { data: html } = await api.get(`https://open.spotify.com/track/${trackId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
  });
  const title  = /og:title[^>]+content="([^"]+)"/.exec(html)?.[1] || null;
  const desc   = /og:description[^>]+content="([^"]+)"/.exec(html)?.[1] || null;
  const image  = /og:image[^>]+content="([^"]+)"/.exec(html)?.[1] || null;
  const artist = desc ? desc.split(' · ')[0] : null;
  return { title, artist, image };
}

// ── Method 3: YouTube search via HTML scraping ────────────────────────────────
async function searchYouTube(query) {
  const { data: html } = await api.get(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' audio')}`,
    { headers: { 'Accept-Language': 'en-US,en;q=0.9' } }
  );
  // Extract first video ID from page
  const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]);
  // Filter out playlist/channel IDs — just take first unique one
  const seen = new Set();
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      return `https://www.youtube.com/watch?v=${id}`;
    }
  }
  throw new Error('No YouTube results found');
}

// ── Method 4: Get audio URL from YouTube URL using free APIs ──────────────────
// Races davidcyriltech and eliteprotech in parallel — first one wins.
async function getAudioUrl(ytUrl) {
  const enc = encodeURIComponent(ytUrl);

  const p1 = api.get(`https://apis.davidcyriltech.my.id/download/ytmp3?url=${enc}`, { timeout: 30000 })
    .then(({ data: d }) => {
      const r   = d?.result || d;
      const url = r?.download_url || r?.downloadUrl || r?.url || d?.url;
      if (typeof url === 'string' && url.startsWith('http'))
        return { url, title: r?.title || d?.title || '', source: 'davidcyriltech' };
      return null;
    })
    .catch(() => null);

  const p2 = api.get(`https://eliteprotech-apis.zone.id/ytdown?url=${enc}&format=mp3`, { timeout: 30000 })
    .then(({ data: d }) => {
      const url = d?.downloadURL || d?.download_url || d?.url || d?.result?.url || d?.result?.download_url;
      if (typeof url === 'string' && url.startsWith('http'))
        return { url, title: d?.title || '', source: 'eliteprotech' };
      return null;
    })
    .catch(() => null);

  // Return first successful result
  return new Promise(resolve => {
    let done = 0;
    const check = v => { if (v) { resolve(v); } else if (++done === 2) resolve(null); };
    p1.then(check);
    p2.then(check);
  });
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'spotify',
  alias: ['spot', 'spoti', 'spt', 'spotifydl', 'spdl'],
  description: 'Download Spotify tracks by name or URL 🎵',
  category: 'download',
  usage: '.spotify <song name or Spotify link>',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    const input = (text || '').trim();

    if (!input) {
      return reply(
        `🎵 *Spotify Downloader*\n\n` +
        `*Usage:*\n` +
        `▸ *${prefix}spotify* <song name>\n` +
        `▸ *${prefix}spotify* <Spotify track URL>\n\n` +
        `*Examples:*\n` +
        `▸ ${prefix}spotify Tum Hi Ho\n` +
        `▸ ${prefix}spotify Shape Of You Ed Sheeran\n` +
        `▸ ${prefix}spotify Blinding Lights\n` +
        `▸ ${prefix}spotify https://open.spotify.com/track/xxx\n\n` +
        `> 🎵 *AA MD Bot*`
      );
    }

    if (input.length > 100) {
      return reply(`❌ Query too long. Keep it under 100 characters.\n\n> 🎵 *AA MD Bot*`);
    }

    await react('⏳');

    let statusMsg;
    try {
      statusMsg = await sock.sendMessage(jid, {
        text: `🎵 *Spotify Downloader*\n\n🔍 _Searching: ${input.slice(0, 50)}_\n\n⏳ _Please wait..._${FOOTER}`,
      }, { quoted: msg });
    } catch { /* ignore */ }

    let result = null;

    // ── Step 1: Determine search query ────────────────────────────────────────
    const spMatch = input.match(SP_RX);
    let searchQuery = input;
    let coverImage  = null;

    if (spMatch) {
      // It's a Spotify URL — extract metadata first
      try {
        const meta = await getSpotifyMeta(spMatch[2]);
        if (meta.title) {
          searchQuery = meta.artist ? `${meta.title} ${meta.artist}` : meta.title;
          coverImage  = meta.image;
          try {
            await sock.sendMessage(jid, {
              edit: statusMsg?.key,
              text: `🎵 *Spotify Downloader*\n\n🎵 _${meta.title}_\n👤 _${meta.artist || 'Unknown'}_\n\n⏳ _Downloading..._${FOOTER}`,
            });
          } catch { /* ignore */ }
        }
      } catch { /* ignore — use URL as query */ }
    }

    // ── Step 2: Try ootaizumi API ─────────────────────────────────────────────
    try {
      result = await tryOotaizumi(searchQuery);
    } catch (e) {
      console.error('[spotify] ootaizumi failed:', e.message);
    }

    // ── Step 3: YouTube search + audio API fallback ───────────────────────────
    if (!result) {
      try {
        try {
          await sock.sendMessage(jid, {
            edit: statusMsg?.key,
            text: `🎵 *Spotify Downloader*\n\n🔄 _Searching YouTube..._\n\n⏳ _Please wait..._${FOOTER}`,
          });
        } catch { /* ignore */ }

        const ytUrl   = await searchYouTube(searchQuery);
        const audio   = await getAudioUrl(ytUrl);
        if (audio?.url) {
          result = {
            title:    audio.title || searchQuery,
            artist:   '',
            audioUrl: audio.url,
            image:    coverImage,
            source:   audio.source,
          };
        }
      } catch (e) {
        console.error('[spotify] YouTube fallback failed:', e.message);
      }
    }

    if (!result) {
      try {
        await sock.sendMessage(jid, {
          edit: statusMsg?.key,
          text: `❌ *Not Found*\n\n_Could not find "${input.slice(0, 50)}"_${FOOTER}`,
        });
      } catch { /* ignore */ }
      await react('❌');
      return reply(
        `❌ *Spotify download failed*\n\n` +
        `💡 *Tips:*\n` +
        `▸ Write exact song name + artist\n` +
        `▸ Try: Artist Name - Song Name\n` +
        `▸ Paste a Spotify track link\n` +
        `▸ Try again in a few seconds${FOOTER}`
      );
    }

    // Update status — sending
    const displayTitle  = (result.title || searchQuery).slice(0, 60);
    const displayArtist = result.artist || '';
    try {
      await sock.sendMessage(jid, {
        edit: statusMsg?.key,
        text: `✅ *Found!*\n\n🎵 _${displayTitle}_${displayArtist ? '\n👤 _' + displayArtist + '_' : ''}\n\n📤 _Sending..._${FOOTER}`,
      });
    } catch { /* ignore */ }

    // ── Send as audio message (with link preview card) ────────────────────────
    await sock.sendMessage(jid, {
      audio: { url: result.audioUrl },
      mimetype: 'audio/mpeg',
      fileName: `${(result.title || searchQuery).replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)}.mp3`,
      contextInfo: result.image ? {
        externalAdReply: {
          title:                displayTitle.substring(0, 30),
          body:                 displayArtist.substring(0, 30) || 'Spotify',
          thumbnailUrl:         result.image,
          sourceUrl:            spMatch ? input : `https://open.spotify.com`,
          mediaType:            1,
          renderLargerThumbnail: true,
        },
      } : undefined,
    }, { quoted: msg });

    // ── Also send as document (for direct save) ────────────────────────────────
    try {
      await sock.sendMessage(jid, {
        document: { url: result.audioUrl },
        mimetype: 'audio/mpeg',
        fileName: `${(result.title || searchQuery).replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)}.mp3`,
        caption:
          `╭━━━━━━━━━━━━━━━━━━━━\n` +
          `┃  🎵 *SPOTIFY*\n` +
          `┣━━━━━━━━━━━━━━━━━━━━\n` +
          `┃ 🎶 *${displayTitle}*\n` +
          (displayArtist ? `┃ 👤 ${displayArtist}\n` : '') +
          `╰━━━━━━━━━━━━━━━━━━━━${FOOTER}`,
      }, { quoted: msg });
    } catch { /* ignore — audio message already sent */ }

    // Final status update
    try {
      await sock.sendMessage(jid, {
        edit: statusMsg?.key,
        text: `✅ *Done!*\n\n🎵 _${displayTitle}_${displayArtist ? '\n👤 _' + displayArtist + '_' : ''}${FOOTER}`,
      });
    } catch { /* ignore */ }

    await react('✅');
  },
};
