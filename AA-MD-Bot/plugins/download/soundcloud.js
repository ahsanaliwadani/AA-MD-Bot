// ============================================
// AA MD Bot - SoundCloud Downloader
// Developer: Ahsan Ali | AA Mods
//
// Commands:
//   .sc <search query or URL>   — search & download from SoundCloud
//   .soundcloud <...>
//   .scloud <...>
//   .scdl <...>
//
// Primary:  yt-dlp scsearch (native SoundCloud support, no API key)
// Fallback: nexray.web.id API
// ============================================

import axios              from 'axios';
import { execFile }       from 'child_process';
import { promisify }      from 'util';
import fs                 from 'fs-extra';
import path               from 'path';
import { fileURLToPath }  from 'url';
import { YTDLP }          from '../../lib/ytdlp.js';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP      = path.join(__dirname, '../../temp');
const FOOTER    = '\n\n> 🎵 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';
const SC_RX     = /https?:\/\/(www\.)?soundcloud\.com\/[^\s]+/i;

// ── Method 1: yt-dlp with scsearch (most reliable) ───────────────────────────
async function ytdlpSoundCloud(query) {
  await fs.ensureDir(TEMP);
  const isUrl   = SC_RX.test(query);
  const target  = isUrl ? query : `scsearch1:${query}`;
  const outFile = path.join(TEMP, `sc_${Date.now()}.mp3`);

  // Get title + URL first (fast)
  const { stdout: infoOut } = await execFileP(YTDLP, [
    target,
    '--get-title', '--get-url',
    '--no-playlist', '--no-warnings',
    '--socket-timeout', '25',
    '-f', 'mp3/bestaudio[ext=mp3]/bestaudio',
  ], { timeout: 40000 });

  const lines    = infoOut.trim().split('\n');
  const title    = lines[0]?.trim() || 'SoundCloud Track';
  const audioUrl = lines[1]?.trim();
  if (!audioUrl?.startsWith('http')) throw new Error('yt-dlp returned no audio URL');

  return { title, audioUrl };
}

// ── Method 2: nexray.web.id API ───────────────────────────────────────────────
async function nexraySoundCloud(url) {
  if (!SC_RX.test(url)) throw new Error('Not a SoundCloud URL — nexray needs a direct URL');
  const { data } = await axios.get(
    `https://api.nexray.web.id/downloader/soundcloud?url=${encodeURIComponent(url)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 25000 }
  );
  if (!data?.status || !data?.result) throw new Error('nexray: no result');
  const { title, audio, thumbnail } = data.result;
  const audioUrl = audio || data.result.url || data.result.download;
  if (!audioUrl) throw new Error('nexray: no audio URL');
  return { title: title || 'SoundCloud Track', audioUrl, thumbnail: thumbnail || null };
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'sc',
  alias: ['soundcloud', 'scloud', 'scdl'],
  description: 'Download audio from SoundCloud 🎵',
  category: 'download',
  usage: '.sc <search term or SoundCloud URL>',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    const query = (text || '').trim();

    if (!query) {
      return reply(
        `🎵 *SoundCloud Downloader*\n\n` +
        `*Usage:*\n` +
        `▸ *${prefix}sc* <song name>\n` +
        `▸ *${prefix}sc* <SoundCloud URL>\n\n` +
        `*Examples:*\n` +
        `▸ ${prefix}sc Tum Hi Ho Arijit Singh\n` +
        `▸ ${prefix}sc Shape Of You Ed Sheeran\n` +
        `▸ ${prefix}sc https://soundcloud.com/user/track\n\n` +
        `> 🎵 *AA MD Bot*`
      );
    }

    await react('⏳');

    let statusMsg;
    try {
      statusMsg = await sock.sendMessage(jid, {
        text: `🔍 *Searching SoundCloud...*\n\n📝 _${query.slice(0, 60)}_\n\n⏳ _Please wait..._${FOOTER}`,
      }, { quoted: msg });
    } catch { /* ignore */ }

    let result = null;
    let method = '';

    // ── Try yt-dlp first (works for both search & URL) ──────────────────────
    try {
      result = await ytdlpSoundCloud(query);
      method = 'yt-dlp';
    } catch (e1) {
      console.error('[sc] yt-dlp failed:', e1.message);

      // ── Fallback: nexray API (URL only) ────────────────────────────────────
      if (SC_RX.test(query)) {
        try {
          result = await nexraySoundCloud(query);
          method = 'nexray';
        } catch (e2) {
          console.error('[sc] nexray failed:', e2.message);
        }
      }
    }

    if (!result) {
      try {
        await sock.sendMessage(jid, {
          edit: statusMsg?.key,
          text: `❌ *Not Found*\n\n_Could not find "${query.slice(0, 50)}" on SoundCloud_${FOOTER}`,
        });
      } catch { /* ignore */ }
      await react('❌');
      return reply(
        `❌ *SoundCloud Download Failed*\n\n` +
        `💡 *Tips:*\n` +
        `▸ Try a different spelling\n` +
        `▸ Use exact artist name + song title\n` +
        `▸ Paste the direct SoundCloud URL\n` +
        `▸ Make sure the track is publicly available${FOOTER}`
      );
    }

    // Update status
    try {
      await sock.sendMessage(jid, {
        edit: statusMsg?.key,
        text: `📥 *Downloading...*\n\n🎵 _${result.title.slice(0, 60)}_\n\n⌛ _Sending audio..._${FOOTER}`,
      });
    } catch { /* ignore */ }

    // Show thumbnail if available (nexray method)
    if (result.thumbnail) {
      try {
        await sock.sendMessage(jid, {
          image: { url: result.thumbnail },
          caption: `🎵 *${result.title}*${FOOTER}`,
        }, { quoted: msg });
      } catch { /* ignore */ }
    }

    // Send audio
    await sock.sendMessage(jid, {
      audio: { url: result.audioUrl },
      mimetype: 'audio/mpeg',
      ptt: false,
      fileName: `${result.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)}.mp3`,
    }, { quoted: msg });

    // Update status to done
    try {
      await sock.sendMessage(jid, {
        edit: statusMsg?.key,
        text: `✅ *Done!*\n\n🎵 _${result.title.slice(0, 60)}_${FOOTER}`,
      });
    } catch { /* ignore */ }

    await react('✅');
  },
};
