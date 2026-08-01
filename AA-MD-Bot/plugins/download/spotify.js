// ============================================
// AA MD Bot - Spotify Downloader
// Developer: Ahsan Ali | AA Mods
//
// Commands:
//   .spotify <song name or Spotify URL>
//   .spot / .spoti / .spt / .spdl
//
// Sends clean audio only — no cards, no attachments, no source references.
// Download chain:
//   1. YouTube search (duration-checked) → race davidcyriltech + eliteprotech
//   2. SoundCloud fallback via yt-dlp
// ============================================

import axios             from 'axios';
import { execFile }      from 'child_process';
import { promisify }     from 'util';
import fs                from 'fs-extra';
import path               from 'path';
import { fileURLToPath } from 'url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP      = path.join(__dirname, '../../temp');
const YTDLP     = '/home/runner/.local/bin/yt-dlp';
const FOOTER    = '\n\n> 🎵 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';
const SP_RX     = /https?:\/\/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i;
const UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const api       = axios.create({ timeout: 25000, headers: { 'User-Agent': UA } });

await fs.ensureDir(TEMP);

// ── Method 1a: davidcyriltech ─────────────────────────────────────────────────
async function tryDavidCyril(ytUrl) {
  const { data } = await api.get(
    `https://apis.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(ytUrl)}`,
    { timeout: 40000 }
  );
  const url = data?.result?.download_url || data?.url || data?.download_url;
  if (typeof url === 'string' && url.startsWith('http')) {
    return { url, title: data?.result?.title || data?.title || '' };
  }
  throw new Error('davidcyriltech: no URL');
}

// ── Method 1b: eliteprotech ───────────────────────────────────────────────────
async function tryEliteProtech(ytUrl) {
  const { data } = await api.get(
    `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(ytUrl)}&format=mp3`,
    { timeout: 40000 }
  );
  const url = data?.downloadURL || data?.download_url || data?.url || data?.result?.url;
  if (typeof url === 'string' && url.startsWith('http')) {
    return { url, title: data?.title || '' };
  }
  throw new Error('eliteprotech: no URL');
}

// ── Race both API methods ─────────────────────────────────────────────────────
async function getAudioFromYT(ytUrl) {
  const p1 = tryDavidCyril(ytUrl).catch(() => null);
  const p2 = tryEliteProtech(ytUrl).catch(() => null);

  return new Promise(resolve => {
    let settled = 0;
    const check = v => {
      if (v) return resolve(v);
      if (++settled === 2) resolve(null);
    };
    p1.then(check);
    p2.then(check);
  });
}

// ── YouTube search (duration-filtered) ───────────────────────────────────────
async function searchYouTubeYtdlp(query, count = 5) {
  const { stdout } = await execFileP(YTDLP, [
    '--flat-playlist',
    '--no-warnings',
    '--print', '%(id)s|||%(duration)s|||%(title)s',
    `ytsearch${count}:${query} audio`,
  ], { timeout: 25000 });

  const lines = stdout.trim().split('\n').filter(Boolean);
  const results = lines.map(line => {
    const [id, durStr, title] = line.split('|||');
    const duration = durStr && durStr !== 'NA' && durStr !== 'None' ? parseInt(durStr, 10) : null;
    return { id, duration, title };
  }).filter(r => r.id);

  if (!results.length) throw new Error('No search results');

  const good = results.find(r => r.duration && r.duration >= 45 && r.duration <= 1200);
  const pick = good || results[0];
  return { ytUrl: `https://www.youtube.com/watch?v=${pick.id}`, videoId: pick.id, duration: pick.duration, title: pick.title };
}

async function searchYouTubeHtml(query) {
  const { data: html } = await api.get(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' audio')}`,
    { headers: { 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 20000 }
  );
  const seen = new Set();
  for (const [, id] of html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)) {
    if (!seen.has(id)) { seen.add(id); return { ytUrl: `https://www.youtube.com/watch?v=${id}`, videoId: id }; }
  }
  throw new Error('No results found');
}

async function searchYouTube(query) {
  try { return await searchYouTubeYtdlp(query); } catch {
    return await searchYouTubeHtml(query);
  }
}

// ── Spotify og: metadata ──────────────────────────────────────────────────────
async function getSpotifyMeta(trackId) {
  const { data: html } = await api.get(`https://open.spotify.com/track/${trackId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
  });
  const title  = /og:title[^>]+content="([^"]+)"/.exec(html)?.[1] || null;
  const desc   = /og:description[^>]+content="([^"]+)"/.exec(html)?.[1] || null;
  const artist = desc ? desc.split(' · ')[0] : null;
  return { title, artist };
}

// ── SoundCloud fallback ───────────────────────────────────────────────────────
async function tryYtdlpSoundCloud(query) {
  const reqId   = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outPath = path.join(TEMP, `${reqId}.mp3`);
  try {
    await execFileP(YTDLP, [
      '--no-playlist', '--extract-audio',
      '--audio-format', 'mp3', '--audio-quality', '5',
      '-o', outPath, `scsearch1:${query}`,
    ], { timeout: 60000 });
    if (!await fs.pathExists(outPath)) throw new Error('No file');
    const stat = await fs.stat(outPath);
    if (stat.size < 50000) throw new Error('File too small');
    const buf = await fs.readFile(outPath);
    return { buf };
  } finally {
    fs.remove(outPath).catch(() => {});
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'spotify',
  alias:   ['spot', 'spoti', 'spt', 'spotifydl', 'spdl'],
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
        `▸ ${prefix}spotify Blinding Lights The Weeknd\n` +
        `▸ ${prefix}spotify https://open.spotify.com/track/xxx\n\n` +
        `> 🎵 *AA MD Bot*`
      );
    }

    if (input.length > 120) return reply(`❌ Query too long (max 120 chars).\n\n> 🎵 *AA MD Bot*`);

    await react('⏳');

    // Editable status message
    let statusMsg;
    const editStatus = async (txt) => {
      try { await sock.sendMessage(jid, { edit: statusMsg?.key, text: txt }); } catch {}
    };

    try {
      statusMsg = await sock.sendMessage(jid, {
        text: `🎵 *Spotify Downloader*\n\n🔍 _Searching: ${input.slice(0, 50)}_\n\n⏳ _Please wait..._${FOOTER}`,
      }, { quoted: msg });
    } catch {}

    // ── Step 1: Resolve Spotify URL → title + artist ──────────────────────
    const spMatch     = input.match(SP_RX);
    let searchQuery   = input;
    let displayTitle  = input;
    let displayArtist = '';

    if (spMatch) {
      try {
        const meta = await getSpotifyMeta(spMatch[2]);
        if (meta.title) {
          displayTitle  = meta.title;
          displayArtist = meta.artist || '';
          searchQuery   = displayArtist ? `${displayTitle} ${displayArtist}` : displayTitle;
          await editStatus(
            `🎵 *Spotify Downloader*\n\n🎵 _${displayTitle}_\n👤 _${displayArtist || 'Unknown'}_\n\n⏳ _Downloading..._${FOOTER}`
          );
        }
      } catch { /* use URL as query */ }
    }

    // ── Step 2: YouTube search (internal — not shown to user) ─────────────
    let ytResult = null;
    try {
      ytResult = await searchYouTube(searchQuery);
      await editStatus(
        `🎵 *Spotify Downloader*\n\n🎵 _${displayTitle.slice(0, 50)}_\n\n📥 _Downloading..._${FOOTER}`
      );
    } catch (e) {
      console.error('[spotify] search failed:', e.message);
    }

    // ── Step 3a: Race two download APIs ────────────────────────────────────
    let audioResult = null;
    if (ytResult) {
      audioResult = await getAudioFromYT(ytResult.ytUrl);
      if (audioResult?.title) displayTitle = audioResult.title || displayTitle;
    }

    // ── Step 3b: SoundCloud fallback ────────────────────────────────────────
    if (!audioResult) {
      await editStatus(
        `🎵 *Spotify Downloader*\n\n🎵 _${displayTitle.slice(0, 50)}_\n\n🔄 _Please wait..._${FOOTER}`
      );
      try {
        const sc = await tryYtdlpSoundCloud(searchQuery);
        if (sc?.buf) {
          const cleanName = (displayTitle || searchQuery).replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);
          // Clean audio only — no contextInfo card
          await sock.sendMessage(jid, {
            audio:    sc.buf,
            mimetype: 'audio/mpeg',
            fileName: `${cleanName}.mp3`,
            ptt:      false,
          }, { quoted: msg });

          await editStatus(`✅ *Downloaded!*\n\n🎵 _${(displayTitle || searchQuery).slice(0, 50)}_${FOOTER}`);
          await react('✅');
          return;
        }
      } catch (e) {
        console.error('[spotify] fallback failed:', e.message);
      }

      await editStatus(`❌ *Not Found*\n\n_Could not find "${input.slice(0, 50)}"_${FOOTER}`);
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

    // ── Step 4: Send clean audio — no card, no attachment ─────────────────
    const cleanTitle = (displayTitle || searchQuery).slice(0, 60);
    const cleanName  = cleanTitle.replace(/[<>:"/\\|?*]/g, '_');

    await editStatus(
      `✅ *Downloaded!*\n\n🎵 _${cleanTitle}_${displayArtist ? '\n👤 _' + displayArtist + '_' : ''}\n\n📤 _Sending..._${FOOTER}`
    );

    // Pure audio message — no contextInfo, no externalAdReply
    await sock.sendMessage(jid, {
      audio:    { url: audioResult.url },
      mimetype: 'audio/mpeg',
      fileName: `${cleanName}.mp3`,
      ptt:      false,
    }, { quoted: msg });

    await editStatus(`✅ *Downloaded!*\n\n🎵 _${cleanTitle}_${displayArtist ? '\n👤 _' + displayArtist + '_' : ''}${FOOTER}`);
    await react('✅');
  },
};
