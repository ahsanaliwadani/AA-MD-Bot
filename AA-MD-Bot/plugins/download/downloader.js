// ============================================
// AA MD Bot - Universal Multi-Platform Downloader
// Primary: yt-dlp (handles TT, IG, FB, TW, SC etc.)
// Platform fallbacks for each service
// ============================================

import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { YTDLP, YTDLP_ARGS, getCookiesFlag } from '../../lib/ytdlp.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');

// Build yt-dlp base args (use YTDLP_ARGS array — no shell quoting issues)
function ytdlpBaseArgs() {
  const ck = getCookiesFlag();
  const ckParts = ck ? ck.trim().split(/\s+/) : [];
  return { flags: [...YTDLP_ARGS], ckParts };
}

// URL detectors
const TT  = /https?:\/\/(www\.)?(vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/gi;
const IG  = /https?:\/\/(www\.)?instagram\.com\/[^\s]+/gi;
const MF  = /https?:\/\/(www\.)?mediafire\.com\/\S+/gi;
const PIN = /https?:\/\/(www\.)?(pinterest\.(com|fr|de|co\.uk|jp|ru|ca|it|com\.au|com\.mx|com\.br|es|pl)|pin\.it)\/[^\s]+/gi;
const FB  = /https?:\/\/(www\.|m\.|web\.)?facebook\.com\/[^\s]+/gi;
const TW  = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+/gi;
const SC  = /https?:\/\/(www\.|on\.)?soundcloud\.com\/[^\s]+/gi;
const SP  = /https?:\/\/open\.spotify\.com\/[^\s]+/gi;
const YT  = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/gi;
const TH  = /https?:\/\/(www\.)?threads\.(net|com)\/[^\s]+/gi;

const clean = (m) => m?.[0]?.replace(/[.,!?;]$/, '');

const extract = (txt) => {
  if (!txt) return null;
  let m;
  m = txt.match(TT);  if (m) return { type: 'tt',  url: clean(m) };
  m = txt.match(IG);  if (m) { const u = clean(m); if (!u.includes('/stories/')) return { type: 'ig', url: u }; }
  m = txt.match(PIN); if (m) return { type: 'pin', url: clean(m) };
  m = txt.match(FB);  if (m) { const u = clean(m); if (!/\/(login|dialog|plugins)\//.test(u)) return { type: 'fb', url: u }; }
  m = txt.match(TW);  if (m) return { type: 'tw',  url: clean(m) };
  m = txt.match(TH);  if (m) return { type: 'th',  url: clean(m) };
  m = txt.match(SC);  if (m) return { type: 'sc',  url: clean(m) };
  m = txt.match(SP);  if (m) return { type: 'sp',  url: clean(m) };
  m = txt.match(YT);  if (m) return { type: 'yt',  url: clean(m) };
  m = txt.match(MF);  if (m) return { type: 'mf',  url: clean(m) };
  return null;
};

const api = axios.create({ timeout: 30000 });

// ── yt-dlp download → buffer (uses execFile — no shell injection) ──────────────
async function ytdlpVideo(url) {
  await fs.ensureDir(TEMP);
  const reqId = `dl_vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outFile = path.join(TEMP, `${reqId}.mp4`);
  const { flags, ckParts } = ytdlpBaseArgs();
  const FMTS = [
    'best[height<=720][ext=mp4]/best[height<=720]/best[ext=mp4]/best',
    'best',
  ];
  for (const fmt of FMTS) {
    try {
      await execFileAsync(YTDLP, [
        ...flags, url, ...ckParts,
        '-f', fmt,
        '--merge-output-format', 'mp4',
        '--no-playlist', '-o', outFile,
        '--quiet', '--no-warnings',
      ], { timeout: 120000 });
      if (await fs.pathExists(outFile)) {
        const buf = await fs.readFile(outFile);
        await fs.remove(outFile).catch(() => {});
        if (buf?.length > 50000) return buf;
      }
    } catch {}
  }
  await fs.remove(outFile).catch(() => {});
  return null;
}

async function ytdlpAudio(url) {
  await fs.ensureDir(TEMP);
  const reqId = `dl_aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outFile = path.join(TEMP, `${reqId}.mp3`);
  const { flags, ckParts } = ytdlpBaseArgs();
  try {
    await execFileAsync(YTDLP, [
      ...flags, url, ...ckParts,
      '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
      '--no-playlist', '-o', outFile,
      '--quiet', '--no-warnings',
    ], { timeout: 120000 });
    if (await fs.pathExists(outFile)) {
      const buf = await fs.readFile(outFile);
      await fs.remove(outFile).catch(() => {});
      if (buf?.length > 10000) return buf;
    }
  } catch {}
  await fs.remove(outFile).catch(() => {});
  return null;
}

// ── Platform-specific fallbacks ────────────────────────────────────────────────
async function tikwm(url) {
  const { data: d } = await api.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`);
  if (d.code !== 0 || !d.data) throw new Error(d.msg || 'TikTok API error');
  return d.data.images?.length
    ? { type: 'images', urls: d.data.images }
    : { type: 'video',  url: d.data.play };
}

async function spotifyDown(url) {
  const id = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/)?.[1];
  if (!id) throw new Error('Invalid Spotify URL — must be a track link');
  const { data } = await api.get(`https://api.spotifydown.com/download/${id}`, {
    headers: { origin: 'https://spotifydown.com', referer: 'https://spotifydown.com' },
  });
  if (!data.success) throw new Error(data.error || 'Spotify download failed');
  return { url: data.link, title: data.metadata?.title, artist: data.metadata?.artists };
}

// ── Working replacement APIs (api-faa.my.id is dead — Cloudflare blocked) ────

async function igramIG(url) {
  // igram.world public API — no auth, handles posts/reels
  const { data: d } = await api.post(
    'https://igram.world/api/convert',
    new URLSearchParams({ url, lang: 'en' }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://igram.world', 'Referer': 'https://igram.world/' }, timeout: 20000 }
  );
  const items = d?.url || [];
  if (!items.length) throw new Error('igram: no media');
  return items;
}

async function fdownloaderFB(url) {
  const form = new URLSearchParams({ q: url, lang: 'en' });
  const { data: d } = await api.post('https://fdownloader.net/api/ajaxSearch', form.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://fdownloader.net',
      'Referer': 'https://fdownloader.net/',
      'User-Agent': 'Mozilla/5.0',
    },
    timeout: 20000,
  });
  const html = d?.data || '';
  const m = html.match(/href="([^"]+\.mp4[^"]*)"[^>]*>(HD|SD|\d+p)/i);
  const videoUrl = m?.[1]?.replace(/&amp;/g, '&');
  if (!videoUrl) throw new Error('fdownloader: no video');
  return videoUrl;
}

async function rednitPin(url) {
  // rednit.com Pinterest API
  const { data: d } = await api.get(`https://api.rednit.com/media?url=${encodeURIComponent(url)}`, { timeout: 15000 });
  return d;
}

async function mediafireDirect(url) {
  // Scrape MediaFire HTML to extract direct download link
  const { data: html } = await api.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });
  const m = html.match(/href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/);
  if (!m) throw new Error('MediaFire: no direct link found');
  return { download_url: m[1], filename: url.split('/').pop()?.split('?')[0] || 'file', size: '' };
}

// ── Main handler ───────────────────────────────────────────────────────────────
export default {
  command: 'dl',
  alias: ['download', 'save'],
  description: 'Multi-platform downloader: TikTok, Instagram, Facebook, Twitter/X, Pinterest, Threads, SoundCloud, Spotify, YouTube, MediaFire',
  category: 'download',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    let raw = text?.trim();
    if (!raw) {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quoted) raw = (quoted.conversation || quoted.extendedTextMessage?.text || '').trim();
    }
    if (!raw) return reply(
      `*🔗 Universal Downloader*\n\n` +
      `*Platforms:* TikTok • Instagram • Facebook • Twitter/X • Pinterest • Threads • SoundCloud • Spotify • YouTube • MediaFire\n\n` +
      `*Usage:* ${prefix}dl <link>\n` +
      `💡 Or reply to any message containing a link`
    );

    const detected = extract(raw);
    if (!detected) return reply('❌ No supported link found. Paste a direct URL from one of the supported platforms.');

    await react('⏳');

    try {
      const { type, url } = detected;

      // ── TikTok ──────────────────────────────────────────────────────────────
      if (type === 'tt') {
        // Try tikwm first (fast), fall back to yt-dlp
        try {
          const result = await tikwm(url);
          if (result.type === 'video') {
            await sock.sendMessage(jid, { video: { url: result.url }, mimetype: 'video/mp4', caption: '🎵 *TikTok via AA MD Bot*' }, { quoted: msg });
          } else {
            for (const img of result.urls.slice(0, 5)) {
              await sock.sendMessage(jid, { image: { url: img } }, { quoted: msg });
            }
          }
        } catch {
          const buf = await ytdlpVideo(url);
          if (!buf?.length) throw new Error('TikTok download failed — try again or check the link');
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '🎵 *TikTok via AA MD Bot*' }, { quoted: msg });
        }
      }

      // ── Instagram ───────────────────────────────────────────────────────────
      else if (type === 'ig') {
        const buf = await ytdlpVideo(url);
        if (buf?.length) {
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '📸 *Instagram via AA MD Bot*' }, { quoted: msg });
        } else {
          // fallback: igram.world API
          const items = await igramIG(url);
          if (!items.length) throw new Error('No media found in this Instagram post');
          for (const item of items.slice(0, 4)) {
            const mediaUrl = item.url || item;
            const isVid = (item.type === 'video') || String(mediaUrl).includes('.mp4');
            await sock.sendMessage(jid, isVid
              ? { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: '📸 *Instagram via AA MD Bot*' }
              : { image: { url: mediaUrl }, caption: '📸 *Instagram via AA MD Bot*' }, { quoted: msg });
          }
        }
      }

      // ── Facebook ────────────────────────────────────────────────────────────
      else if (type === 'fb') {
        const buf = await ytdlpVideo(url);
        if (buf?.length) {
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '📘 *Facebook via AA MD Bot*' }, { quoted: msg });
        } else {
          // fallback: fdownloader.net
          const videoUrl = await fdownloaderFB(url);
          if (!videoUrl) throw new Error('No video found in this Facebook post');
          await sock.sendMessage(jid, { video: { url: videoUrl }, mimetype: 'video/mp4', caption: '📘 *Facebook via AA MD Bot*' }, { quoted: msg });
        }
      }

      // ── Twitter / X ─────────────────────────────────────────────────────────
      else if (type === 'tw') {
        const buf = await ytdlpVideo(url);
        if (!buf?.length) throw new Error('Could not download this tweet — make sure it contains a video');
        await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '🐦 *Twitter/X via AA MD Bot*' }, { quoted: msg });
      }

      // ── Threads ─────────────────────────────────────────────────────────────
      else if (type === 'th') {
        const buf = await ytdlpVideo(url);
        if (!buf?.length) throw new Error('No downloadable video found in this Threads post');
        await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '🧵 *Threads via AA MD Bot*' }, { quoted: msg });
      }

      // ── SoundCloud ──────────────────────────────────────────────────────────
      else if (type === 'sc') {
        const buf = await ytdlpAudio(url);
        if (!buf?.length) throw new Error('SoundCloud download failed — try a public track link');
        await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', fileName: 'soundcloud.mp3' }, { quoted: msg });
      }

      // ── Spotify ─────────────────────────────────────────────────────────────
      else if (type === 'sp') {
        const r = await spotifyDown(url);
        await sock.sendMessage(jid, {
          audio: { url: r.url },
          mimetype: 'audio/mpeg',
          fileName: r.title ? `${r.title} - ${r.artist}.mp3` : 'spotify.mp3',
          ptt: false,
        }, { quoted: msg });
      }

      // ── YouTube ─────────────────────────────────────────────────────────────
      else if (type === 'yt') {
        const buf = await ytdlpAudio(url);
        if (!buf?.length) throw new Error('YouTube download failed — use .play for music or .video for video');
        await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', fileName: 'youtube.mp3' }, { quoted: msg });
      }

      // ── MediaFire ───────────────────────────────────────────────────────────
      else if (type === 'mf') {
        // Try yt-dlp first (supports MediaFire), then HTML scraping
        let dlUrl = null, filename = 'mediafire-file';
        try {
          const buf = await ytdlpVideo(url);
          if (buf?.length) {
            await sock.sendMessage(jid, { document: buf, fileName: 'mediafire-file', mimetype: 'application/octet-stream', caption: '📦 *MediaFire via AA MD Bot*' }, { quoted: msg });
            await react('✅');
            return;
          }
        } catch {}
        const r = await mediafireDirect(url);
        dlUrl = r.download_url;
        filename = r.filename;
        await sock.sendMessage(jid, {
          document: { url: dlUrl },
          fileName: filename || 'mediafire-file',
          mimetype: 'application/octet-stream',
          caption: `📦 *MediaFire Download*\n📄 ${filename}`,
        }, { quoted: msg });
      }

      // ── Pinterest ────────────────────────────────────────────────────────────
      else if (type === 'pin') {
        // Try yt-dlp first (supports Pinterest), then rednit API
        const buf = await ytdlpVideo(url);
        if (buf?.length) {
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '📌 *Pinterest via AA MD Bot*' }, { quoted: msg });
        } else {
          const r = await rednitPin(url);
          const videoUrl = r?.video_url || r?.url;
          const imageUrl = r?.image_url || r?.thumbnail;
          if (videoUrl) await sock.sendMessage(jid, { video: { url: videoUrl }, mimetype: 'video/mp4', caption: '📌 *Pinterest via AA MD Bot*' }, { quoted: msg });
          else if (imageUrl) await sock.sendMessage(jid, { image: { url: imageUrl }, caption: '📌 *Pinterest via AA MD Bot*' }, { quoted: msg });
          else throw new Error('No media found in this Pinterest pin');
        }
      }

      await react('✅');
    } catch (e) {
      console.error('[dl]', e.message);
      await react('❌');
      reply(`❌ *Download failed*\n\n${e.message}\n\n💡 Try the dedicated command:\n• *.ig* for Instagram\n• *.tiktok* for TikTok\n• *.play* / *.video* for YouTube`);
    }
  },
};
