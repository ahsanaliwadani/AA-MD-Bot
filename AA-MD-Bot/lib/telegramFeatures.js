// ╔══════════════════════════════════════════════════════════════════╗
// ║   AA MD Bot — Telegram Features Bot  v2                         ║
// ║   Token: TELEGRAM_FEATURES_BOT_TOKEN                            ║
// ║   Downloads: multi-API race (6 sources, fastest wins)           ║
// ╚══════════════════════════════════════════════════════════════════╝

import TelegramBot    from 'node-telegram-bot-api';
import axios          from 'axios';
import { execFile }   from 'child_process';
import { promisify }  from 'util';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import nodePath       from 'node:path';
import { logger }     from './logger.js';
import playdl         from 'play-dl';

const execFileAsync = promisify(execFile);
const TOKEN  = process.env.TELEGRAM_FEATURES_BOT_TOKEN;
// Use the same yt-dlp resolver as the WhatsApp bot (handles Replit/VPS/Oracle automatically)
import { YTDLP as _YTDLP } from './ytdlp.js';
const YTDLP  = _YTDLP;
const HTML   = { parse_mode: 'HTML' };

// ── Style ────────────────────────────────────────────────────────────────────
const esc    = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const DIV    = '━━━━━━━━━━━━━━━━━━━━━━';
const FOOTER = `\n${DIV}\n🤖 <b>AA MD Bot</b>`;

function formatDur(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// Per-user cooldown
const _cd = new Map();
function cooldown(uid, ms = 4000) {
  const now = Date.now(), last = _cd.get(uid) || 0, wait = ms - (now - last);
  if (wait > 0) return Math.ceil(wait / 1000);
  _cd.set(uid, now);
  return 0;
}

// Edit-in-place fallback helper
async function edit(bot, chatId, msgId, text, opts = {}) {
  try { return await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...opts }); }
  catch { return bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts }).catch(() => {}); }
}

const sendText = (bot, id, text, extra = {}) =>
  bot.sendMessage(id, text, { parse_mode: 'HTML', ...extra }).catch(() => {});

// Race first non-null result
function raceFirst(promises) {
  return new Promise(resolve => {
    let left = promises.length;
    if (!left) return resolve(null);
    for (const p of promises) {
      Promise.resolve(p)
        .then(v => { if (v) resolve(v); })
        .catch(() => {})
        .finally(() => { if (--left === 0) resolve(null); });
    }
  });
}

// Download a URL as a Buffer; throws if > maxMb or on network error
async function downloadBuffer(url, maxMb = 49) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: maxMb * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  return Buffer.from(res.data);
}

// Fetch YouTube thumbnail as Buffer (fallback to null)
async function ytThumbBuf(id) {
  for (const q of ['maxresdefault', 'hqdefault', 'mqdefault']) {
    try {
      const buf = await downloadBuffer(`https://i.ytimg.com/vi/${id}/${q}.jpg`, 5);
      if (buf.length > 1000) return buf;
    } catch {}
  }
  return null;
}

function pickUrl(data, ...keys) {
  for (const k of keys) {
    const v = k.split('.').reduce((o, kk) => o?.[kk], data);
    if (v && typeof v === 'string' && v.startsWith('http')) return v;
  }
  return null;
}

async function fetchUrl(url, timeout = 18000) {
  const { data } = await axios.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } });
  return data;
}

// ── YouTube ──────────────────────────────────────────────────────────────────
const YTID_RX = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/;

async function ytSearchInfo(query) {
  try {
    // Use play-dl (no yt-dlp required)
    const results = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
    if (!results?.length) throw new Error('No results');
    const v = results[0];
    return { id: v.id, title: v.title, duration: v.durationInSec };
  } catch (e) {
    // Fallback: try YouTube search via free API
    const { data } = await axios.get(
      `https://yt.lemnoslife.com/noKey/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1`,
      { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const item = data?.items?.[0];
    if (!item) throw new Error('No results found for: ' + query);
    return { id: item.id?.videoId, title: item.snippet?.title, duration: 0 };
  }
}

// ── Audio API sources ────────────────────────────────────────────────────────
const mkYtUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

async function mp3Keith(id)  { try { const d = await fetchUrl(`https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(mkYtUrl(id))}`); return pickUrl(d,'result.data.downloadUrl','result.downloadUrl','result.url'); } catch { return null; } }
async function mp3Faa(id)    { try { const d = await fetchUrl(`https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(mkYtUrl(id))}`); return pickUrl(d,'result.mp3','result.url','url'); } catch { return null; } }
async function mp3Nexray(id) { try { const d = await fetchUrl(`https://api.nexray.eu.cc/downloader/v1/ytmp3?url=${encodeURIComponent(mkYtUrl(id))}`); return pickUrl(d,'result.url','data.url','url'); } catch { return null; } }

// ── Video API sources ────────────────────────────────────────────────────────
async function mp4Keith(id)  { try { const d = await fetchUrl(`https://apis-keith.vercel.app/download/dlmp4?url=${encodeURIComponent(mkYtUrl(id))}`); return pickUrl(d,'result.data.downloadUrl','result.downloadUrl','result.url'); } catch { return null; } }
async function mp4Faa(id)    { try { const d = await fetchUrl(`https://api-faa.my.id/faa/ytmp4?url=${encodeURIComponent(mkYtUrl(id))}`); return pickUrl(d,'result.download_url','result.url','url'); } catch { return null; } }
async function mp4Nexray(id) { try { const d = await fetchUrl(`https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${encodeURIComponent(mkYtUrl(id))}`); return pickUrl(d,'result.url','data.url','url'); } catch { return null; } }
async function mp4Agatz(id)  { try { const d = await fetchUrl(`https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(mkYtUrl(id))}`); return pickUrl(d,'data.url','url','result'); } catch { return null; } }
async function mp4Gtech(id)  {
  try {
    const d = await fetchUrl(`https://gtech-api-xtp1.onrender.com/api/video/yt?url=${encodeURIComponent(mkYtUrl(id))}`);
    if (d?.status && d?.result?.media) {
      const hd = d.result.media.video_hd, sd = d.result.media.video_sd;
      const u = (hd && hd !== 'No HD video URL available') ? hd : sd;
      if (u && typeof u === 'string') return u;
    }
  } catch {}
  return null;
}

const resolveAudio = (id) => raceFirst([mp3Nexray(id), mp3Keith(id), mp3Faa(id)]);
const resolveVideo = (id) => raceFirst([mp4Nexray(id), mp4Keith(id), mp4Faa(id), mp4Agatz(id), mp4Gtech(id)]);

// ── TikTok ───────────────────────────────────────────────────────────────────
const TT_RX = /https?:\/\/(www\.)?(vm\.|vt\.|m\.)?tiktok\.com\/\S+/i;

async function tikwm(url)  {
  const { data } = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, { headers: { 'User-Agent':'Mozilla/5.0' }, timeout: 25000 });
  if (data.code !== 0 || !data.data) throw new Error(data.msg || 'TikWM failed');
  return data.data;
}
async function tikly(url) {
  const { data } = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, { headers: { 'User-Agent':'Mozilla/5.0' }, timeout: 25000 });
  if (!data?.videoUrl) throw new Error('No video URL');
  return { play: data.videoUrl, title: data.title || 'TikTok', author: { unique_id: data.author || '' } };
}

// ── Facebook ─────────────────────────────────────────────────────────────────
const FB_RX = /https?:\/\/(www\.|m\.|web\.)?facebook\.com\/\S+|https?:\/\/fb\.watch\/\S+/i;
async function fbDl(url) {
  const { stdout } = await execFileAsync(YTDLP, ['--get-url','-f','best[filesize<45M]/best','--no-playlist','--quiet',url], { timeout: 35000 });
  const link = stdout.trim().split('\n')[0];
  if (!link) throw new Error('No URL extracted');
  return link;
}

// ── Instagram ────────────────────────────────────────────────────────────────
const IG_RX = /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+/i;

async function igDl(url) {
  // API 1: ryzendesu (no yt-dlp, fast)
  try {
    const { data } = await axios.get(
      `https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`,
      { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const vid = data?.data?.[0]?.url || data?.data?.url;
    if (vid && typeof vid === 'string' && vid.startsWith('http')) return vid;
  } catch {}

  // API 2: saveig
  try {
    const { data } = await axios.get(
      `https://api.saveig.app/api?url=${encodeURIComponent(url)}`,
      { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const link = data?.data?.[0]?.url || pickUrl(data, 'url', 'data.url');
    if (link && link.startsWith('http')) return link;
  } catch {}

  // Fallback: yt-dlp
  try {
    const { stdout } = await execFileAsync(YTDLP, ['--get-url','-f','best[filesize<45M]/best','--no-playlist','--quiet',url], { timeout: 32000 });
    const link = stdout.trim().split('\n')[0];
    if (link && link.startsWith('http')) return link;
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('yt-dlp not available — bot is still initialising, try again in 30 seconds');
    throw new Error('Could not extract URL — post may be private or login required');
  }
  throw new Error('Could not extract URL — post must be public');
}

// ── Twitter/X ─────────────────────────────────────────────────────────────────
const TW_RX = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s/]+\/status\/\d+/i;
async function twDl(url) {
  // vxtwitter API — no auth, no yt-dlp needed
  const api = url.replace(/https?:\/\/(www\.)?(twitter\.com|x\.com)/, 'https://api.vxtwitter.com');
  const { data } = await axios.get(api, { timeout: 18000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const vid = data?.media_extended?.find(m => m.type === 'video' || m.type === 'gif');
  const img = data?.media_extended?.find(m => m.type === 'image');
  if (!vid && !img) throw new Error('No media found in this tweet');
  return {
    type: vid ? 'video' : 'image',
    url:  (vid || img).url,
    text: data.text || '',
    author: data.user_name || data.user_screen_name || '',
  };
}

// ── Pinterest ─────────────────────────────────────────────────────────────────
const PIN_RX = /https?:\/\/(www\.)?(pinterest\.(com|fr|de|co\.uk|jp|ca|it|es|com\.au|com\.mx|com\.br|pl)|pin\.it)\/[^\s]+/i;
async function pinDl(url) {
  // API 1: pindl
  try {
    const { data } = await axios.get(
      `https://api.pindl.com/api/pindl?url=${encodeURIComponent(url)}`,
      { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (data?.data?.video_url) return { type: 'video', url: data.data.video_url };
    if (data?.data?.image_url) return { type: 'image', url: data.data.image_url };
  } catch {}

  // API 2: ryzendesu
  try {
    const { data } = await axios.get(
      `https://api.ryzendesu.vip/api/downloader/pinterest?url=${encodeURIComponent(url)}`,
      { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const link = data?.data?.url || data?.url;
    if (link && link.startsWith('http')) return { type: link.includes('.mp4') ? 'video' : 'image', url: link };
  } catch {}

  // yt-dlp fallback
  try {
    const { stdout } = await execFileAsync(YTDLP,
      ['--get-url', '-f', 'best', '--no-playlist', '--quiet', url], { timeout: 30000 }
    );
    const link = stdout.trim().split('\n')[0];
    if (link?.startsWith('http')) return { type: 'video', url: link };
  } catch {}

  throw new Error('No downloadable media found — check the pin URL');
}

// ── Threads ────────────────────────────────────────────────────────────────────
const TH_RX = /https?:\/\/(www\.)?threads\.(net|com)\/[^\s]+/i;
async function threadsDl(url) {
  // savethreads.com API
  try {
    const { data } = await axios.post(
      'https://savethreads.com/api/download',
      { url },
      { headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }
    );
    const items = data?.data || [];
    const vid = items.find(i => i.type === 'video' || i.url?.includes('.mp4'));
    const img = items.find(i => i.type === 'image' || /\.(jpg|jpeg|png|webp)/i.test(i.url || ''));
    if (vid?.url) return { type: 'video', url: vid.url };
    if (img?.url) return { type: 'image', url: img.url };
  } catch {}

  // yt-dlp fallback
  try {
    const { stdout } = await execFileAsync(YTDLP,
      ['--get-url', '-f', 'best[height<=720]/best', '--no-playlist', '--quiet', url], { timeout: 30000 }
    );
    const link = stdout.trim().split('\n')[0];
    if (link?.startsWith('http')) return { type: 'video', url: link };
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('yt-dlp not ready — try again in 30 seconds');
  }

  throw new Error('No media found — post may be private or deleted');
}

// ── Spotify ────────────────────────────────────────────────────────────────────
const SP_RX = /https?:\/\/open\.spotify\.com\/(track|playlist)\/([a-zA-Z0-9]+)/i;
const SD_HDR = { origin: 'https://spotifydown.com', referer: 'https://spotifydown.com/' };
async function spotifyMeta(id) {
  const { data } = await axios.get(`https://api.spotifydown.com/metadata/track/${id}`,
    { headers: SD_HDR, timeout: 12000 });
  return data;
}
async function spotifyDownload(id) {
  const { data } = await axios.get(`https://api.spotifydown.com/download/${id}`,
    { headers: SD_HDR, timeout: 25000 });
  if (!data?.success || !data?.link) throw new Error(data?.error || 'spotifydown failed');
  return data;
}
async function spotifyPlaylistTracks(id) {
  const { data } = await axios.get(`https://api.spotifydown.com/trackList/playlist/${id}`,
    { headers: SD_HDR, timeout: 12000 });
  return data?.trackList?.slice(0, 5) || [];
}

// ── Reddit ─────────────────────────────────────────────────────────────────────
const RD_RX = /https?:\/\/(www\.|old\.)?reddit\.com\/(r\/[^/\s]+\/comments\/[^/\s]+)/i;
async function redditDl(url) {
  const clean = url.replace(/\/$/, '').split('?')[0];
  const { data } = await axios.get(`${clean}.json?limit=1`, {
    timeout: 15000,
    headers: { 'User-Agent': 'AA-MD-Bot/3.0 (by /u/aabotuser)' },
  });
  const post = data?.[0]?.data?.children?.[0]?.data;
  if (!post) throw new Error('Post not found');

  if (post.is_video && post.media?.reddit_video) {
    const rv = post.media.reddit_video;
    return {
      type: 'video',
      url: rv.fallback_url || rv.hls_url,
      title: post.title, subreddit: post.subreddit_name_prefixed, ups: post.ups,
    };
  }
  if (post.url && /\.(jpg|jpeg|png|gif|webp)/i.test(post.url)) {
    return { type: 'image', url: post.url, title: post.title, subreddit: post.subreddit_name_prefixed, ups: post.ups };
  }
  if (post.media_metadata) {
    const images = Object.values(post.media_metadata)
      .filter(m => m.status === 'valid')
      .map(m => (m.s?.u || m.s?.gif || '').replace(/&amp;/g, '&'))
      .filter(u => u.startsWith('http'))
      .slice(0, 10);
    if (images.length) return { type: 'gallery', images, title: post.title, subreddit: post.subreddit_name_prefixed, ups: post.ups };
  }
  if (post.url_overridden_by_dest?.startsWith('http')) {
    return { type: 'link', url: post.url_overridden_by_dest, title: post.title };
  }
  throw new Error('No downloadable media — this may be a text post');
}

// ── Weather ──────────────────────────────────────────────────────────────────
async function weather(city) {
  const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 15000, headers: { Accept:'application/json' } });
  const cur = data?.current_condition?.[0], area = data?.nearest_area?.[0];
  if (!cur) throw new Error('No data returned');
  return {
    city:    area?.areaName?.[0]?.value || city,
    country: area?.country?.[0]?.value  || '',
    temp_c:  cur.temp_C, temp_f: cur.temp_F, feels: cur.FeelsLikeC,
    humidity: cur.humidity, desc: cur.weatherDesc?.[0]?.value || '',
    wind: cur.windspeedKmph, uv: cur.uvIndex, vis: cur.visibility,
    pressure: cur.pressure, cloud: cur.cloudcover,
  };
}

// ── AI — per-user memory + multi-model fallback ───────────────────────────────
const AI_SYSTEM = `You are AA MD Bot — a highly intelligent AI assistant built by AA Mods (Ahsan Ali Wadani).

Your Expertise: Science, Technology, Programming, Mathematics, History, Islam, Culture, Medicine, Law basics, Business, and general knowledge.

FORMATTING (Telegram HTML — always follow):
- Use <b>bold</b> for headings and key terms
- Use <i>italics</i> for examples and emphasis
- Use numbered lists (1. 2. 3.) for steps
- Use • for bullet points
- Use <code>code</code> for code snippets
- Add blank lines between sections for readability

BEHAVIOR:
- Give COMPLETE, thorough answers — never vague or one-line for complex questions
- For code: provide full working code + explain each part
- For math: show every step of the working
- For Islam: answer accurately from Quran and Sunnah perspective
- Match the user's language automatically (Urdu, English, Roman Urdu, Arabic, etc.)
- Be warm, professional, and genuinely helpful — not robotic
- If unsure: say so clearly and give your best reasoning`;

const AI_MODELS    = ['openai', 'openai-fast'];
const _aiMemory   = new Map(); // userId → messages[]
const _aiLastUsed = new Map();
const AI_MAX_USERS = 500;
const AI_MAX_MSG   = 20;

// ch.at free AI helper (no key required)
async function chatAtCall(prompt, retries = 2) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await axios.post('https://ch.at/api/chat',
        { message: prompt },
        { headers: { 'Content-Type': 'application/json', 'User-Agent': 'AA-MD-Bot/3.0' }, timeout: 12000 }
      );
      const raw = typeof res.data === 'string' ? res.data
        : (res.data?.answer || res.data?.reply || res.data?.message || res.data?.response || '');
      const match = raw.match(/\bA:\s*([\s\S]+)$/);
      const text = match ? match[1].trim() : (typeof raw === 'string' && raw.trim().length > 4 ? raw.trim() : null);
      if (text) return text;
    } catch {}
    if (i < retries) await new Promise(r => setTimeout(r, 400 * i));
  }
  return null;
}

function aiEvict() {
  if (_aiMemory.size <= AI_MAX_USERS) return;
  let oldest = null, oldestT = Infinity;
  for (const [id, t] of _aiLastUsed) { if (t < oldestT) { oldest = id; oldestT = t; } }
  if (oldest) { _aiMemory.delete(oldest); _aiLastUsed.delete(oldest); }
}

function aiGetHist(uid)  { return _aiMemory.get(uid) || []; }
function aiClearHist(uid){ _aiMemory.delete(uid); _aiLastUsed.delete(uid); }

function aiAddHist(uid, role, content) {
  const hist = aiGetHist(uid);
  hist.push({ role, content });
  if (hist.length > AI_MAX_MSG) hist.splice(0, hist.length - AI_MAX_MSG);
  _aiMemory.set(uid, hist);
  _aiLastUsed.set(uid, Date.now());
  aiEvict();
}

async function aiChat(userId, prompt) {
  aiAddHist(userId, 'user', prompt);
  const messages = [{ role:'system', content: AI_SYSTEM }, ...aiGetHist(userId)];
  let reply = null, lastErr = null;

  // 1. Try ch.at (no key, fast)
  const flatPrompt = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n') + '\nAssistant:';
  reply = await chatAtCall(flatPrompt).catch(() => null);

  // 2. Try pollinations GET (simple fallback)
  if (!reply) {
    try {
      const res = await axios.get(
        'https://text.pollinations.ai/' + encodeURIComponent(prompt.slice(0, 600)) + '?model=openai&seed=' + (Date.now() % 9999),
        { timeout: 20000 }
      );
      if (typeof res.data === 'string' && res.data.trim()) reply = res.data.trim();
    } catch {}
  }

  // 3. Pollinations OpenAI-compatible POST (most capable)
  if (!reply) {
    for (const model of AI_MODELS) {
      try {
        const { data } = await axios.post('https://text.pollinations.ai/openai', {
          model, messages, temperature: 0.4, max_tokens: 2048,
        }, { headers: { 'Content-Type':'application/json' }, timeout: 40000 });
        const r = data?.choices?.[0]?.message?.content?.trim();
        if (r) { reply = r; break; }
      } catch (e) { lastErr = e; }
    }
  }

  if (!reply) throw lastErr || new Error('All AI models failed');

  // Step 1: extract code blocks, escape HTML in non-code parts, put code back
  const codeChunks = [];
  reply = reply.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeChunks.length;
    codeChunks.push(`<pre><code>${esc(code.trim())}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });
  // escape inline code too
  reply = reply.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codeChunks.length;
    codeChunks.push(`<code>${esc(code)}</code>`);
    return `\x00CODE${idx}\x00`;
  });
  // now safe to escape the rest (no < > & from the model in plain text)
  reply = esc(reply);
  // markdown → Telegram HTML on the escaped text
  reply = reply
    .replace(/\*\*(.*?)\*\*/g,  '<b>$1</b>')
    .replace(/\*(.*?)\*/g,      '<b>$1</b>')
    .replace(/__(.*?)__/g,      '<i>$1</i>')
    .replace(/_(.*?)_/g,        '<i>$1</i>')
    .replace(/^#{1,6}\s+(.*)/gm,'<b>$1</b>')
    .trim();
  // restore code blocks
  for (let i = 0; i < codeChunks.length; i++) {
    reply = reply.replace(`\x00CODE${i}\x00`, codeChunks[i]);
  }

  aiAddHist(userId, 'assistant', reply);
  return reply;
}

// ── AI Image — prompt enhancer + multi-model ──────────────────────────────────
const IMG_MODELS = {
  default:  { id: 'flux',         label: '✨ Quality',    w: 1024, h: 1024 },
  realistic:{ id: 'flux-realism', label: '📸 Realistic',  w: 1024, h: 1024 },
  anime:    { id: 'flux-anime',   label: '🎌 Anime',      w: 1024, h: 1024 },
  fast:     { id: 'turbo',        label: '⚡ Fast',       w: 1024, h: 1024 },
};

function parseImgFlags(text) {
  let m = 'default', w = 1024, h = 1024, clean = text;
  if (/--real(istic)?/i.test(clean)) { m='realistic'; clean=clean.replace(/--real(istic)?/gi,''); }
  else if (/--anime/i.test(clean))   { m='anime';     clean=clean.replace(/--anime/gi,''); }
  else if (/--fast/i.test(clean))    { m='fast';      clean=clean.replace(/--fast/gi,''); }
  if (/--portrait|--port/i.test(clean)) { w=832; h=1216; clean=clean.replace(/--portrait|--port/gi,''); }
  else if (/--wide|--landscape/i.test(clean)) { w=1216; h=832; clean=clean.replace(/--wide|--landscape/gi,''); }
  else {
    if (/\b(portrait|face|selfie|headshot|person|girl|boy|man|woman|character)\b/i.test(clean)) { w=832; h=1216; }
    else if (/\b(landscape|panorama|wide|mountain|city|skyline|horizon|banner)\b/i.test(clean)) { w=1216; h=832; }
  }
  return { model: m, w, h, prompt: clean.trim() };
}

async function enhanceImgPrompt(userPrompt, modelKey) {
  const hints = {
    default:   'high quality digital art, highly detailed, 8K, cinematic lighting, professional composition',
    realistic: 'photorealistic, DSLR photography, RAW photo, perfect exposure, bokeh, Canon EOS R5',
    anime:     'anime art style, Studio Ghibli quality, vibrant colors, detailed linework, manga illustration',
    fast:      'digital art, colorful, detailed',
  };
  try {
    const { data } = await axios.post('https://text.pollinations.ai/openai', {
      model: 'openai',
      messages: [
        { role:'system', content:`You are an expert AI art prompt engineer. Expand the user's simple description into a vivid, detailed image generation prompt. Add: "${hints[modelKey]||hints.default}". Keep under 120 words. Output ONLY the enhanced prompt — no quotes, no explanation.` },
        { role:'user',   content:`Enhance: "${userPrompt}"` },
      ],
      temperature: 0.8, max_tokens: 200,
    }, { headers: {'Content-Type':'application/json'}, timeout: 15000 });
    const r = data?.choices?.[0]?.message?.content?.trim();
    return (r && r.length > userPrompt.length) ? r : userPrompt;
  } catch { return userPrompt; }
}

function buildImgUrl(prompt, model, w, h) {
  const m = IMG_MODELS[model] || IMG_MODELS.default;
  const seed = Math.floor(Math.random() * 9999999);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&model=${m.id}&seed=${seed}&nologo=true`;
}

// ── Translate ────────────────────────────────────────────────────────────────
const LANG_NAMES = {
  en:'English', ur:'Urdu', ar:'Arabic', fr:'French', de:'German', es:'Spanish',
  hi:'Hindi', tr:'Turkish', ru:'Russian', zh:'Chinese', ja:'Japanese', ko:'Korean',
  it:'Italian', pt:'Portuguese', fa:'Persian', bn:'Bengali', id:'Indonesian',
  ms:'Malay', nl:'Dutch', pl:'Polish', sv:'Swedish', fi:'Finnish', no:'Norwegian',
};
async function translate(text, lang = 'en') {
  const { data } = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${lang}`, { timeout: 15000 });
  if (data?.quotaFinished) throw new Error('Daily quota finished');
  const result = data?.responseData?.translatedText;
  if (!result || result === text) throw new Error('Translation unavailable');
  return result;
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────
async function wiki(query) {
  const { data } = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, { timeout: 15000 });
  if (!data?.extract) throw new Error('No article found');
  return data;
}

// ── Movie ─────────────────────────────────────────────────────────────────────
async function movie(query) {
  for (const key of ['trilogy','thewdb','b9bd48a6']) {
    try {
      const { data } = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(query)}&type=movie&apikey=${key}`, { timeout: 15000 });
      if (data?.Response === 'True') return data;
    } catch {}
  }
  // TMDB fallback
  const { data: s } = await axios.get(`https://api.themoviedb.org/3/search/movie?api_key=8265bd1679663a7ea12ac168da84d2e8&query=${encodeURIComponent(query)}&page=1`, { timeout: 15000 });
  const m = s?.results?.[0];
  if (!m) throw new Error('Movie not found');
  return { Title: m.title, Year: (m.release_date||'').slice(0,4), imdbRating: (m.vote_average||0).toFixed(1), imdbVotes: (m.vote_count||0).toLocaleString(), Genre:'N/A', Runtime:'N/A', Released: m.release_date||'N/A', Director:'N/A', Actors:'N/A', Awards:'N/A', Plot: m.overview||'No synopsis.', Poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'N/A', Source:'TMDB' };
}

// ── Anime ─────────────────────────────────────────────────────────────────────
async function anime(query) {
  const { data } = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1&sfw=true`, { timeout: 18000, headers: { 'User-Agent':'AA-MD-Bot/3.0' } });
  const r = data?.data?.[0];
  if (!r) throw new Error('Anime not found');
  return r;
}

// ── Lyrics ────────────────────────────────────────────────────────────────────
async function lyrics(query) {
  try {
    const { data: s } = await axios.get(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`, { timeout: 12000 });
    const song = s?.data?.[0];
    if (song) {
      const { data: l } = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(song.artist.name)}/${encodeURIComponent(song.title)}`, { timeout: 12000 });
      if (l?.lyrics) return { title: song.title, artist: song.artist.name, cover: song.album?.cover_medium, lyrics: l.lyrics };
    }
  } catch {}
  // Fallback: lrclib
  const { data } = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}&limit=1`, { timeout: 12000 });
  const r = data?.[0];
  if (!r) throw new Error('Lyrics not found');
  return { title: r.trackName, artist: r.artistName, cover: null, lyrics: r.plainLyrics || 'Unavailable' };
}

// ── News ──────────────────────────────────────────────────────────────────────
async function news(topic = 'latest') {
  const { data } = await axios.get(
    `https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&lang=en&max=5&apikey=bb9ced0e7e57e2e0f9e7e7c7c14d1c93`,
    { timeout: 15000 }
  ).catch(async () => {
    // Fallback: BBC RSS
    const { data: rss } = await axios.get('https://feeds.bbci.co.uk/news/rss.xml', { timeout: 12000 });
    const items = [...rss.matchAll(/<title><!\[CDATA\[([^\]]+)\]]/g)].slice(1, 6).map(m => ({ title: m[1], url: '' }));
    return { data: { articles: items.map(i => ({ title: i.title, url: i.url, source: { name: 'BBC News' }, publishedAt: '' })) } };
  });
  return data.articles || [];
}

// ── Crypto ────────────────────────────────────────────────────────────────────
async function crypto(coins = ['bitcoin','ethereum','binancecoin','cardano','solana']) {
  const ids = coins.join(',');
  const { data } = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { timeout: 15000, headers: { 'User-Agent':'AA-MD-Bot/3.0' } }
  );
  return data;
}

// ── GitHub ────────────────────────────────────────────────────────────────────
async function github(username) {
  const [{ data: u }, { data: r }] = await Promise.all([
    axios.get(`https://api.github.com/users/${encodeURIComponent(username)}`, { timeout: 12000, headers: { 'User-Agent':'AA-MD-Bot/3.0' } }),
    axios.get(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=3`, { timeout: 12000, headers: { 'User-Agent':'AA-MD-Bot/3.0' } }),
  ]);
  return { user: u, repos: r };
}

// ── URL Shortener ─────────────────────────────────────────────────────────────
async function shorten(url) {
  // TinyURL (no API key needed)
  const { data } = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 10000 });
  if (!data || !data.startsWith('http')) throw new Error('Could not shorten URL');
  return data.trim();
}

// ── Screenshot ────────────────────────────────────────────────────────────────
function screenshotUrl(url) {
  return `https://api.screenshotmachine.com/?key=b11a46&url=${encodeURIComponent(url)}&dimension=1366x768&format=jpg&delay=2000`;
}

// ── Urban Dictionary ──────────────────────────────────────────────────────────
async function urban(query) {
  const { data } = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(query)}`, { timeout: 12000 });
  const entry = data?.list?.[0];
  if (!entry) throw new Error('No definition found');
  return { word: entry.word, definition: entry.definition?.replace(/\[|\]/g,'') || '', example: entry.example?.replace(/\[|\]/g,'') || '', thumbs_up: entry.thumbs_up };
}

// ── Fun APIs ──────────────────────────────────────────────────────────────────
async function joke() {
  const { data } = await axios.get('https://v2.jokeapi.dev/joke/Programming,Miscellaneous,Pun?blacklistFlags=nsfw,racist,sexist,explicit&type=single', { timeout: 12000 });
  if (!data?.joke) throw new Error('No joke');
  return { joke: data.joke, category: data.category };
}
async function quote() {
  const { data } = await axios.get('https://zenquotes.io/api/random', { timeout: 12000 });
  const q = Array.isArray(data) ? data[0] : data;
  if (!q?.q) throw new Error('No quote');
  return { text: q.q, author: q.a };
}
async function fact() {
  try {
    const { data } = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 10000 });
    if (data?.text) return data.text;
  } catch {}
  const { data } = await axios.get('https://api.chucknorris.io/jokes/random', { timeout: 10000 });
  if (!data?.value) throw new Error('No fact');
  return data.value;
}

// ── QR Code ───────────────────────────────────────────────────────────────────
const qrUrl = (t) => `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=12&data=${encodeURIComponent(t)}`;

// ── Calculator (safe) ─────────────────────────────────────────────────────────
function calcExpr(expr) {
  // Whitelist: digits, operators, parentheses, sqrt, pi, e, spaces
  const clean = expr.trim().replace(/x/gi,'*').replace(/÷/g,'/').replace(/[^0-9+\-*/%.()^√πe\s]/g,'');
  if (!clean) throw new Error('Invalid expression');
  const js = clean
    .replace(/\^/g, '**')
    .replace(/√(\d+(\.\d+)?)/g, 'Math.sqrt($1)')
    .replace(/π/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E');
  // eslint-disable-next-line no-new-func
  const result = Function('"use strict"; return (' + js + ')')();
  if (!isFinite(result)) throw new Error('Result is not a finite number');
  const fmt = Number.isInteger(result) ? result : parseFloat(result.toFixed(10));
  return { expr: clean, result: fmt };
}

// ── World Time ────────────────────────────────────────────────────────────────
async function worldTime(query) {
  // Try exact timezone string first
  const ALIASES = {
    karachi:'Asia/Karachi', pakistan:'Asia/Karachi', pk:'Asia/Karachi',
    dubai:'Asia/Dubai', uae:'Asia/Dubai', london:'Europe/London',
    newyork:'America/New_York', 'new york':'America/New_York', usa:'America/New_York',
    tokyo:'Asia/Tokyo', japan:'Asia/Tokyo', beijing:'Asia/Shanghai', china:'Asia/Shanghai',
    istanbul:'Europe/Istanbul', turkey:'Europe/Istanbul', riyadh:'Asia/Riyadh',
    saudi:'Asia/Riyadh', lahore:'Asia/Karachi', islamabad:'Asia/Karachi',
  };
  const tz = ALIASES[query.toLowerCase().trim()] || query.replace(/\s+/g,'/');
  try {
    const { data } = await axios.get(`https://worldtimeapi.org/api/timezone/${tz}`, { timeout: 12000 });
    if (data?.datetime) return { ...data, tz };
  } catch {}
  // Fuzzy: list all timezones and find closest
  const { data: zones } = await axios.get('https://worldtimeapi.org/api/timezone', { timeout: 10000 });
  const q = query.toLowerCase();
  const match = zones?.find(z => z.toLowerCase().includes(q));
  if (!match) throw new Error(`Timezone not found for "${query}".\n\nTry: Karachi, Dubai, London, Tokyo, New_York`);
  const { data: d } = await axios.get(`https://worldtimeapi.org/api/timezone/${match}`, { timeout: 10000 });
  return { ...d, tz: match };
}

// ── Currency Converter ────────────────────────────────────────────────────────
async function currencyConvert(amount, from, to) {
  // Free API — no key required
  const { data } = await axios.get(
    `https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`,
    { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const rate = data?.rates?.[to.toUpperCase()];
  if (!rate) throw new Error(`Currency "${to.toUpperCase()}" not found.\n\nTry: USD EUR GBP PKR SAR AED JPY INR`);
  const result = amount * rate;
  return { amount, from: from.toUpperCase(), to: to.toUpperCase(), rate, result };
}

// ── Random Meme ───────────────────────────────────────────────────────────────
async function randomMeme() {
  const { data } = await axios.get('https://meme-api.com/gimme', { timeout: 15000 });
  if (!data?.url) throw new Error('No meme available right now');
  return data;
}

// ── Password Generator ────────────────────────────────────────────────────────
function genPassword(length = 16, type = 'strong') {
  const len = Math.min(Math.max(parseInt(length) || 16, 6), 64);
  const lower  = 'abcdefghijklmnopqrstuvwxyz';
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const syms   = '!@#$%^&*()-_=+';
  const chars  = type === 'pin' ? digits
    : type === 'simple'  ? lower + digits
    : lower + upper + digits + syms;
  let pwd = '';
  for (let i = 0; i < len; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return { password: pwd, length: len, strength: type };
}

// ══════════════════════════════════════════════════════════════════════════════
// Bot init
// ══════════════════════════════════════════════════════════════════════════════
export function initTelegramFeatures() {
  if (!TOKEN) {
    logger.warn('⚡ TELEGRAM_FEATURES_BOT_TOKEN not set — features bot disabled');
    return;
  }

  const bot = new TelegramBot(TOKEN, { polling: true });

  // ── Inline keyboards ──────────────────────────────────────────────────────────
  const KB_START = {
    inline_keyboard: [
      [{ text: '🎵 Downloads',    callback_data: 'help_dl'     }, { text: '🤖 AI & Images',   callback_data: 'help_ai'   }],
      [{ text: '🔍 Search & Info',callback_data: 'help_search' }, { text: '🌐 Utilities',      callback_data: 'help_util' }],
      [{ text: '😄 Fun',          callback_data: 'help_fun'    }, { text: '🛠 Tools',           callback_data: 'help_tools'}],
      [{ text: '📋 All Commands',  callback_data: 'help_all',  }],
    ],
  };
  const KB_BACK_START = {
    inline_keyboard: [[{ text: '« Back to Menu', callback_data: 'start_menu' }]],
  };

  const HELP_SECTIONS = {
    help_dl: {
      title: '🎵 Downloads',
      text:
        `┣ /play <i>song name or URL</i> — YouTube MP3\n` +
        `┣ /video <i>title or URL</i> — YouTube MP4\n` +
        `┣ /tiktok <i>url</i> — TikTok video\n` +
        `┣ /ig <i>url</i> — Instagram reel/post\n` +
        `┣ /fb <i>url</i> — Facebook video\n` +
        `┣ /twitter <i>url</i> — Twitter/X video\n` +
        `┣ /pin <i>url</i> — Pinterest image/video\n` +
        `┣ /threads <i>url</i> — Threads video/image\n` +
        `┣ /spotify <i>url</i> — Spotify track (MP3)\n` +
        `┗ /reddit <i>url</i> — Reddit video/image`,
    },
    help_ai: {
      title: '🤖 AI & Image Generation',
      text:
        `┣ /ai <i>question</i> — Chat with AI (memory, multi-model)\n` +
        `┃   /ai clear — Reset your chat history\n` +
        `┗ /imagine <i>description</i> — Generate AI image\n` +
        `    Flags: <code>--realistic</code>  <code>--anime</code>  <code>--fast</code>\n` +
        `           <code>--portrait</code>   <code>--wide</code>`,
    },
    help_search: {
      title: '🔍 Search & Info',
      text:
        `┣ /wiki <i>query</i> — Wikipedia article\n` +
        `┣ /movie <i>title</i> — Movie details & rating\n` +
        `┣ /anime <i>title</i> — Anime info (MAL)\n` +
        `┣ /lyrics <i>song</i> — Song lyrics\n` +
        `┣ /news <i>[topic]</i> — Latest news headlines\n` +
        `┣ /crypto — Live Bitcoin, ETH & more\n` +
        `┣ /github <i>username</i> — GitHub profile & repos\n` +
        `┗ /urban <i>word</i> — Urban Dictionary definition`,
    },
    help_util: {
      title: '🌐 Utilities',
      text:
        `┣ /weather <i>city</i> — Live weather & forecast\n` +
        `┣ /translate <i>text</i> — Translate to English\n` +
        `┃   <i>or: /translate ur: Hello → translate to Urdu</i>\n` +
        `┣ /short <i>url</i> — Shorten a URL (TinyURL)\n` +
        `┣ /ss <i>url</i> — Screenshot a website\n` +
        `┣ /qr <i>text or URL</i> — Generate QR code\n` +
        `┣ /sticker <i>url or reply photo</i> — Image → sticker\n` +
        `┗ /ocr <i>url or reply photo</i> — Extract text from image`,
    },
    help_fun: {
      title: '😄 Fun',
      text:
        `┣ /joke — Random programming/misc joke\n` +
        `┣ /quote — Inspirational quote\n` +
        `┣ /fact — Random interesting fact\n` +
        `┗ /meme — Random meme image`,
    },
    help_tools: {
      title: '🛠 Tools',
      text:
        `┣ /calc <i>expression</i> — Calculator (e.g. /calc 25*4+10)\n` +
        `┣ /currency <i>100 USD PKR</i> — Currency converter\n` +
        `┣ /time <i>city</i> — World clock (e.g. /time Karachi)\n` +
        `┗ /password <i>[length]</i> — Generate strong password`,
    },
    help_all: {
      title: '📋 All Commands',
      text:
        `🎵 <b>Downloads:</b> /play /video /tiktok /ig /fb /twitter /pin /threads /spotify /reddit\n` +
        `🤖 <b>AI:</b> /ai /imagine\n` +
        `🔍 <b>Search:</b> /wiki /movie /anime /lyrics /news /crypto /github /urban\n` +
        `🌐 <b>Utils:</b> /weather /translate /short /ss /qr /sticker /ocr\n` +
        `😄 <b>Fun:</b> /joke /quote /fact /meme\n` +
        `🛠 <b>Tools:</b> /calc /currency /time /password\n` +
        `⚙️ <b>General:</b> /ping /id /help`,
    },
  };

  // ── /start ───────────────────────────────────────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    const name = esc(msg.from?.first_name || 'there');
    sendText(bot, msg.chat.id,
      `👋 <b>Hello, ${name}!</b>\n\n` +
      `🤖 <b>AA MD Bot — Telegram Features</b>\n${DIV}\n\n` +
      `Your WhatsApp bot's powers, right here on Telegram!\n\n` +
      `🎵 YouTube, TikTok, Instagram, Facebook downloads\n` +
      `🤖 AI chat with memory + AI image generation\n` +
      `🔍 Search, weather, movies, anime, lyrics & more\n` +
      `🌐 Translate, URL shortener, QR codes & more\n\n` +
      `<i>Choose a category below or type /help</i>` +
      FOOTER,
      { reply_markup: KB_START }
    );
  });

  // ── /help ────────────────────────────────────────────────────────────────────
  bot.onText(/\/help/, (msg) => {
    sendText(bot, msg.chat.id,
      `📋 <b>AA MD Bot — Command Menu</b>\n${DIV}\n\n` +
      `Choose a category to see its commands:` +
      FOOTER,
      { reply_markup: KB_START }
    );
  });

  // ── Inline callback: help sections ───────────────────────────────────────────
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId  = query.message.message_id;
    await bot.answerCallbackQuery(query.id).catch(() => {});

    if (query.data === 'start_menu') {
      return edit(bot, chatId, msgId,
        `📋 <b>AA MD Bot — Command Menu</b>\n${DIV}\n\nChoose a category:` + FOOTER,
        { reply_markup: KB_START }
      );
    }

    const section = HELP_SECTIONS[query.data];
    if (section) {
      return edit(bot, chatId, msgId,
        `${section.title}\n${DIV}\n\n${section.text}` + FOOTER,
        { reply_markup: KB_BACK_START }
      );
    }
  });

  // ── /ping ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/ping/, async (msg) => {
    const t0 = Date.now();
    const sent = await bot.sendMessage(msg.chat.id, '🏓 <i>Pinging...</i>', HTML).catch(() => null);
    if (!sent) return;
    const ms = Date.now() - t0, upSec = Math.floor(process.uptime());
    const up = upSec > 3600 ? `${Math.floor(upSec/3600)}h ${Math.floor((upSec%3600)/60)}m` : `${Math.floor(upSec/60)}m ${upSec%60}s`;
    edit(bot, msg.chat.id, sent.message_id,
      `🏓 <b>Pong!</b>  <code>${ms}ms</code>\n${DIV}\n\n` +
      `⏱ Uptime: <b>${esc(up)}</b>\n` +
      `💾 RAM: <b>${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB</b>\n` +
      `📦 Node: <b>${esc(process.version)}</b>` + FOOTER
    );
  });

  // ── /id ───────────────────────────────────────────────────────────────────────
  bot.onText(/\/id/, (msg) => {
    const u = msg.from;
    sendText(bot, msg.chat.id,
      `🪪 <b>Your Telegram Info</b>\n${DIV}\n\n` +
      `👤 <b>User ID:</b> <code>${u?.id}</code>\n` +
      `📛 <b>Name:</b> ${esc([(u?.first_name||''), (u?.last_name||'')].join(' ').trim())}\n` +
      `🔖 <b>Username:</b> ${u?.username ? '@'+esc(u.username) : 'None'}\n` +
      `🌐 <b>Language:</b> ${esc(u?.language_code || 'N/A')}\n` +
      `💬 <b>Chat ID:</b> <code>${msg.chat.id}</code>\n` +
      `📂 <b>Chat type:</b> ${esc(msg.chat.type)}` + FOOTER
    );
  });

  // ── /play ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/play(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/play song name or YouTube URL</code>\n<i>Example: /play Noor-e-Muhammad</i>`);

    const w = cooldown(msg.from.id, 5000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `🔍 <b>Searching...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      let id, title = query, duration = '';
      const ytMatch = query.match(YTID_RX);
      if (ytMatch) { id = ytMatch[1]; }
      else {
        await edit(bot, chatId, sent.message_id, `🔍 <b>Searching:</b> <i>${esc(query)}</i>...`);
        const info = await ytSearchInfo(query);
        id = info.id; title = info.title || query; duration = formatDur(info.duration);
      }

      await edit(bot, chatId, sent.message_id,
        `⏬ <b>Downloading audio...</b>\n🎵 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}\n<i>Connecting to fastest source...</i>`
      );

      let audioUrl = await resolveAudio(id);
      let audioBuf = null;

      if (audioUrl) {
        await edit(bot, chatId, sent.message_id,
          `⏬ <b>Downloading audio...</b>\n🎵 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}\n<i>Preparing file...</i>`
        );
        try { audioBuf = await downloadBuffer(audioUrl, 49); } catch { audioBuf = null; }
      }

      // ── yt-dlp fallback (when all APIs fail or buffer download fails) ─────
      if (!audioBuf && !audioUrl) {
        await edit(bot, chatId, sent.message_id,
          `⏬ <b>Downloading audio...</b>\n🎵 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}\n<i>Using yt-dlp fallback...</i>`
        );
        const tmpAudio = nodePath.join(os.tmpdir(), `tg_aud_${Date.now()}.mp3`);
        try {
          await execFileAsync(YTDLP, [
            '--extractor-args', 'youtube:player_client=android',
            '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
            '--no-playlist', '--quiet', '--no-warnings',
            '-o', tmpAudio,
            mkYtUrl(id),
          ], { timeout: 120000 });
          const stat = await fs.stat(tmpAudio).catch(() => null);
          if (stat && stat.size > 0) audioBuf = await fs.readFile(tmpAudio);
        } catch {} finally {
          fs.unlink(tmpAudio).catch(() => {});
        }
        if (!audioBuf) throw new Error('All download sources failed — paste the YouTube URL directly');
      }

      const audioCap = `🎵 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}` + FOOTER;
      const thumb    = id ? await ytThumbBuf(id) : null;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      await bot.sendChatAction(chatId, 'upload_voice').catch(() => {});

      const audioSendOpts = { caption: audioCap, parse_mode: 'HTML', title, ...(thumb ? { thumbnail: thumb } : {}) };
      const source = audioBuf || audioUrl;
      await bot.sendAudio(chatId, source, audioSendOpts).catch(async () => {
        await bot.sendDocument(chatId, audioBuf || audioUrl, { caption: audioCap, parse_mode: 'HTML', ...(thumb ? { thumbnail: thumb } : {}) }).catch(() => {});
      });
    } catch (e) {
      edit(bot, chatId, sent.message_id,
        `❌ <b>Audio download failed</b>\n\n<i>${esc(e.message)}</i>\n\n💡 Try a different song name or paste the YouTube URL.`
      );
    }
  });

  // ── /video ────────────────────────────────────────────────────────────────────
  bot.onText(/\/video(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/video title or YouTube URL</code>\n<i>Example: /video Shape of You</i>`);

    const w = cooldown(msg.from.id, 5000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `🔍 <b>Searching...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      let id, title = query, duration = '';
      const ytMatch = query.match(YTID_RX);
      if (ytMatch) { id = ytMatch[1]; }
      else {
        await edit(bot, chatId, sent.message_id, `🔍 <b>Searching:</b> <i>${esc(query)}</i>...`);
        const info = await ytSearchInfo(query);
        id = info.id; title = info.title || query; duration = formatDur(info.duration);
      }

      await edit(bot, chatId, sent.message_id,
        `⏬ <b>Downloading video...</b>\n🎬 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}\n<i>Connecting to fastest source...</i>`
      );

      await edit(bot, chatId, sent.message_id,
        `⏬ <b>Downloading video...</b>\n🎬 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}\n<i>Connecting to fastest source...</i>`
      );

      let videoBuf = null;

      // ── Step 1: API race (fastest — returns CDN URL, download buffer) ─────
      const videoUrl = await resolveVideo(id).catch(() => null);
      if (videoUrl) {
        try { videoBuf = await downloadBuffer(videoUrl, 45); } catch { videoBuf = null; }
      }

      // ── Step 2: yt-dlp (format 18=360p H.264+AAC, 22=720p — single file, no merge) ──
      if (!videoBuf) {
        await edit(bot, chatId, sent.message_id,
          `⏬ <b>Downloading video...</b>\n🎬 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}\n<i>Using yt-dlp (this may take 20-40s)...</i>`
        );
        const tmpFile = nodePath.join(os.tmpdir(), `tg_vid_${Date.now()}.mp4`);
        try {
          await execFileAsync(YTDLP, [
            '--extractor-args', 'youtube:player_client=android',
            '-f', '18/22/bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][filesize<45M]/best[filesize<45M]',
            '--merge-output-format', 'mp4',
            '--no-playlist', '--quiet', '--no-warnings',
            '-o', tmpFile,
            mkYtUrl(id),
          ], { timeout: 180000 });
          const stat = await fs.stat(tmpFile).catch(() => null);
          if (stat && stat.size > 50000) videoBuf = await fs.readFile(tmpFile);
        } catch {} finally {
          fs.unlink(tmpFile).catch(() => {});
        }
      }

      if (!videoBuf) throw new Error('Video download failed — file too large, unavailable, or bot-checked');

      const videoCap = `🎬 <b>${esc(title)}</b>\n${duration ? `⏱ ${esc(duration)}\n` : ''}` + FOOTER;
      const thumb    = id ? await ytThumbBuf(id) : null;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      await bot.sendChatAction(chatId, 'upload_video').catch(() => {});

      const videoSendOpts = { caption: videoCap, parse_mode: 'HTML', supports_streaming: true, ...(thumb ? { thumbnail: thumb } : {}) };
      await bot.sendVideo(chatId, videoBuf, videoSendOpts).catch(async () => {
        await bot.sendDocument(chatId, videoBuf, {
          caption: videoCap, parse_mode: 'HTML', ...(thumb ? { thumbnail: thumb } : {}),
        }).catch(() => {});
      });
    } catch (e) {
      edit(bot, chatId, sent.message_id,
        `❌ <b>Video download failed</b>\n\n<i>${esc(e.message)}</i>\n\n💡 Try /play for audio only, or paste the direct YouTube URL.`
      );
    }
  });

  // ── /tiktok ───────────────────────────────────────────────────────────────────
  bot.onText(/\/tiktok(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, url = (match[1]||'').trim();
    if (!url || !TT_RX.test(url)) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/tiktok https://tiktok.com/...</code>\n<i>Supports vt.tiktok.com short links</i>`);

    const w = cooldown(msg.from.id, 5000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `⏬ <b>Fetching TikTok...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const d = await raceFirst([tikwm(url).catch(()=>null), tikly(url).catch(()=>null)]);
      if (!d) throw new Error('All TikTok sources failed');

      const cap =
        `🎵 <b>${esc(d.title || 'TikTok')}</b>\n\n` +
        `👤 @${esc(d.author?.unique_id || 'unknown')}\n` +
        (d.digg_count ? `❤️ ${Number(d.digg_count).toLocaleString()}` : '') +
        (d.comment_count ? `  💬 ${Number(d.comment_count).toLocaleString()}` : '') + '\n' + FOOTER;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});

      if (d.images?.length) {
        const media = d.images.slice(0, 10).map((img, i) => ({ type:'photo', media:img, ...(i===0 ? { caption:cap, parse_mode:'HTML' } : {}) }));
        await bot.sendMediaGroup(chatId, media).catch(async () => {
          await bot.sendPhoto(chatId, d.images[0], { caption:cap, parse_mode:'HTML' }).catch(() => {});
        });
      } else if (d.play) {
        await bot.sendVideo(chatId, d.play, { caption:cap, parse_mode:'HTML' }).catch(async () => {
          await bot.sendDocument(chatId, d.play, { caption:cap, parse_mode:'HTML' }).catch(() => {});
        });
      } else {
        sendText(bot, chatId, `❌ Could not extract media from this TikTok.`);
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ <b>TikTok failed</b>\n\n<i>${esc(e.message)}</i>\n\n💡 Make sure the link is public.`);
    }
  });

  // ── /ig ───────────────────────────────────────────────────────────────────────
  bot.onText(/\/ig(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, url = (match[1]||'').trim();
    if (!url || !IG_RX.test(url)) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/ig https://instagram.com/p/...</code>\n<i>Supports posts, reels, IGTV</i>`);

    const w = cooldown(msg.from.id, 5000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `⏬ <b>Fetching Instagram...</b>\n<i>May take a moment...</i>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const videoUrl = await igDl(url);
      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      const cap = `📸 <b>Instagram</b>\n${FOOTER}`;
      await bot.sendVideo(chatId, videoUrl, { caption:cap, parse_mode:'HTML' }).catch(async () => {
        await bot.sendDocument(chatId, videoUrl, { caption:cap, parse_mode:'HTML' }).catch(() => {});
      });
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ <b>Instagram failed</b>\n\n<i>${esc(e.message)}</i>\n\n💡 Post must be public.`);
    }
  });

  // ── /fb ───────────────────────────────────────────────────────────────────────
  bot.onText(/\/fb(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, url = (match[1]||'').trim();
    if (!url || !FB_RX.test(url)) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/fb https://facebook.com/...</code>\n<i>Video must be public</i>`);

    const w = cooldown(msg.from.id, 5000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `⏬ <b>Downloading Facebook video...</b>\n<i>Please wait...</i>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const videoUrl = await fbDl(url);
      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      await bot.sendVideo(chatId, videoUrl, { caption:`📘 <b>Facebook Video</b>\n${FOOTER}`, parse_mode:'HTML' }).catch(async () => {
        await bot.sendDocument(chatId, videoUrl, { caption:`📘 <b>Facebook Video</b>\n${FOOTER}`, parse_mode:'HTML' }).catch(() => {});
      });
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ <b>Facebook failed</b>\n\n<i>${esc(e.message)}</i>\n\n💡 Ensure the video is public.`);
    }
  });

  // ── /ai ───────────────────────────────────────────────────────────────────────
  bot.onText(/\/ai(?:\s+([\s\S]+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const prompt = (match[1]||'').trim();

    if (!prompt) return sendText(bot, chatId,
      `🤖 <b>AA MD Bot AI — Powered</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/ai your question</code>\n\n` +
      `<b>Examples:</b>\n` +
      `• <code>/ai Explain quantum entanglement</code>\n` +
      `• <code>/ai Python mein fibonacci sequence kaise banayein</code>\n` +
      `• <code>/ai Namaz ki rakat kitni hain detail mein</code>\n` +
      `• <code>/ai Write a professional email for a job application</code>\n\n` +
      `<b>Commands:</b>\n` +
      `• <code>/ai clear</code> — Reset your chat history\n\n` +
      `<b>Features:</b>\n` +
      `• Multi-model AI (GPT-4o → Mistral → Claude fallback)\n` +
      `• Remembers your last 10 exchanges\n` +
      `• Answers in your language (Urdu/English/Arabic)\n` +
      `• Expert-level, thorough responses` +
      FOOTER
    );

    if (prompt.toLowerCase() === 'clear') {
      aiClearHist(userId);
      return sendText(bot, chatId, `🧹 <b>Chat history cleared.</b>\n\n<i>Fresh start — ask me anything!</i>` + FOOTER);
    }

    const w = cooldown(userId, 4000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId,
      `🤖 <b>Thinking...</b>\n<i>${esc(prompt.slice(0, 80))}${prompt.length > 80 ? '…' : ''}</i>`, HTML
    ).catch(() => null);
    if (!sent) return;

    try {
      await bot.sendChatAction(chatId, 'typing').catch(() => {});
      const reply = await aiChat(userId, prompt);
      const htmlMsg = `🤖 <b>AI Reply</b>\n${DIV}\n\n${reply}` + FOOTER;
      // Try HTML mode; if Telegram rejects it (malformed tags), fall back to plain text
      const ok = await bot.editMessageText(htmlMsg, {
        chat_id: chatId, message_id: sent.message_id, parse_mode: 'HTML',
      }).catch(() => null);
      if (!ok) {
        // strip all HTML tags for plain-text fallback
        const plain = htmlMsg
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
        await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
        await bot.sendMessage(chatId, plain).catch(() => {});
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id,
        `❌ <b>AI Error</b>\n\n<i>${esc(e.message)}</i>\n\n💡 Try rephrasing your question.`
      );
    }
  });

  // ── /imagine ──────────────────────────────────────────────────────────────────
  bot.onText(/\/imagine(?:\s+([\s\S]+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw    = (match[1]||'').trim();

    if (!raw) return sendText(bot, chatId,
      `🎨 <b>AI Image Generator — Powered</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/imagine your description</code>\n\n` +
      `<b>Examples:</b>\n` +
      `• <code>/imagine Pakistani village at golden hour</code>\n` +
      `• <code>/imagine anime girl in cherry blossom forest --anime</code>\n` +
      `• <code>/imagine futuristic Karachi city at night --wide</code>\n` +
      `• <code>/imagine lion portrait in savanna --real --portrait</code>\n\n` +
      `<b>Style Flags (add to your prompt):</b>\n` +
      `• <code>--real</code> — 📸 Photorealistic (DSLR quality)\n` +
      `• <code>--anime</code> — 🎌 Anime/manga style\n` +
      `• <code>--fast</code> — ⚡ Faster generation\n` +
      `• <code>--portrait</code> — 🖼 Tall/portrait ratio\n` +
      `• <code>--wide</code> — 🌄 Wide/landscape ratio\n\n` +
      `✨ <i>AI auto-enhances your prompt for best results</i>` +
      FOOTER
    );

    const w = cooldown(msg.from.id, 10000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const flags = parseImgFlags(raw);
    const mInfo = IMG_MODELS[flags.model] || IMG_MODELS.default;
    const ratio  = flags.w === 832 ? '🖼 Portrait' : flags.w === 1216 ? '🌄 Landscape' : '⬛ Square';

    const sent = await bot.sendMessage(chatId,
      `🎨 <b>Generating image...</b>\n` +
      `${mInfo.label}  •  ${ratio}\n` +
      `<i>✨ Enhancing prompt...</i>`,
      HTML
    ).catch(() => null);
    if (!sent) return;

    try {
      await bot.sendChatAction(chatId, 'upload_photo').catch(() => {});

      // Step 1: enhance prompt
      const enhanced = await enhanceImgPrompt(flags.prompt, flags.model);

      // Step 2: update status
      edit(bot, chatId, sent.message_id,
        `🎨 <b>Generating image...</b>\n${mInfo.label}  •  ${ratio}\n<i>⚙️ Rendering...</i>`, HTML
      );

      // Step 3: fetch image buffer (more reliable than URL send in Telegram)
      const imgUrl = buildImgUrl(enhanced, flags.model, flags.w, flags.h);
      const { data: imgBuf } = await axios.get(imgUrl, {
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      await bot.sendPhoto(chatId, Buffer.from(imgBuf), {
        caption:
          `🎨 <b>AI Generated Image</b>\n${DIV}\n\n` +
          `📝 <i>${esc(flags.prompt.slice(0, 150))}${flags.prompt.length > 150 ? '…' : ''}</i>\n` +
          `${mInfo.label}  •  ${ratio}` +
          FOOTER,
        parse_mode: 'HTML',
      });
    } catch (e) {
      edit(bot, chatId, sent.message_id,
        `❌ <b>Image generation failed</b>\n\n<i>${esc(e.message)}</i>\n\n💡 Try a simpler description or add <code>--fast</code>.`
      );
    }
  });

  // ── /weather ──────────────────────────────────────────────────────────────────
  bot.onText(/\/weather(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, city = (match[1]||'').trim();
    if (!city) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/weather Karachi</code>`);

    const sent = await bot.sendMessage(chatId, `🌍 <b>Fetching weather for ${esc(city)}...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const w = await weather(city);
      const emoji = /thunder|storm/i.test(w.desc)?'⛈':/drizzle|shower|rain/i.test(w.desc)?'🌧':/snow|blizzard/i.test(w.desc)?'❄️':/fog|mist|haze/i.test(w.desc)?'🌫':/cloud|overcast/i.test(w.desc)?'⛅':/clear|sunny/i.test(w.desc)?'☀️':'🌤';
      edit(bot, chatId, sent.message_id,
        `${emoji} <b>Weather — ${esc(w.city)}, ${esc(w.country)}</b>\n${DIV}\n\n` +
        `🌡 <b>Temp:</b> ${esc(w.temp_c)}°C  /  ${esc(w.temp_f)}°F\n` +
        `🤔 <b>Feels like:</b> ${esc(w.feels)}°C\n` +
        `☁️ <b>Condition:</b> ${esc(w.desc)}\n\n` +
        `💧 Humidity: <b>${esc(w.humidity)}%</b>\n` +
        `💨 Wind: <b>${esc(w.wind)} km/h</b>\n` +
        `☁ Cloud: <b>${esc(w.cloud)}%</b>\n` +
        `👁 Visibility: <b>${esc(w.vis)} km</b>\n` +
        `🔵 Pressure: <b>${esc(w.pressure)} hPa</b>\n` +
        `☀️ UV Index: <b>${esc(w.uv)}</b>` + FOOTER
      );
    } catch {
      edit(bot, chatId, sent.message_id, `❌ No weather data for "<b>${esc(city)}</b>".\n\nCheck the city name spelling.`);
    }
  });

  // ── /translate ────────────────────────────────────────────────────────────────
  bot.onText(/\/translate(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let input = (match[1]||'').trim();
    if (!input) return sendText(bot, chatId,
      `❌ <b>Usage:</b>\n<code>/translate Hello</code> → English\n<code>/translate ur: Hello</code> → Urdu\n\n<b>Codes:</b> en ur ar hi fr de es tr ru zh ja ko pt id ms`
    );

    let lang = 'en';
    if (/^[a-z]{2}:\s*/i.test(input)) { lang = input.slice(0,2).toLowerCase(); input = input.slice(input.indexOf(':')+1).trim(); }

    const sent = await bot.sendMessage(chatId, `🌐 <b>Translating...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const result = await translate(input, lang);
      const langName = esc(LANG_NAMES[lang] || lang.toUpperCase());
      edit(bot, chatId, sent.message_id,
        `🌐 <b>Translation → ${langName}</b>\n${DIV}\n\n` +
        `<b>Original:</b>\n<i>${esc(input)}</i>\n\n` +
        `<b>Translated:</b>\n${esc(result)}` + FOOTER
      );
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Translation failed: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /wiki ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/wiki(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/wiki Pakistan</code>`);

    const sent = await bot.sendMessage(chatId, `🔍 <b>Searching Wikipedia...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const w = await wiki(query);
      const extract = esc(w.extract||'').slice(0, 900);
      const caption = `📖 <b>${esc(w.title)}</b>\n${DIV}\n\n${extract}${w.extract?.length > 900 ? `...\n\n<a href="${esc(w.content_urls?.desktop?.page||'')}">Read more →</a>` : ''}` + FOOTER;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      const thumb = w.thumbnail?.source;
      if (thumb) {
        await bot.sendPhoto(chatId, thumb, { caption, parse_mode:'HTML' }).catch(() => sendText(bot, chatId, caption));
      } else {
        sendText(bot, chatId, caption);
      }
    } catch {
      edit(bot, chatId, sent.message_id, `❌ No Wikipedia article for "<b>${esc(query)}</b>".`);
    }
  });

  // ── /movie ────────────────────────────────────────────────────────────────────
  bot.onText(/\/movie(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/movie Inception</code>`);

    const sent = await bot.sendMessage(chatId, `🎬 <b>Looking up movie...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const m = await movie(query);
      const cap =
        `🎬 <b>${esc(m.Title)}</b> <i>(${esc(m.Year)})</i>${m.Source==='TMDB'?' <i>(TMDB)</i>':''}\n${DIV}\n\n` +
        `⭐ <b>Rating:</b> ${esc(m.imdbRating)}/10  📊 ${esc(m.imdbVotes)} votes\n` +
        (m.Genre!=='N/A'?`🎭 ${esc(m.Genre)}\n`:'') +
        (m.Runtime!=='N/A'?`⏱ ${esc(m.Runtime)}\n`:'') +
        `📅 ${esc(m.Released)}\n` +
        (m.Director!=='N/A'?`🎬 ${esc(m.Director)}\n`:'') +
        (m.Actors!=='N/A'?`🎭 ${esc(m.Actors)}\n`:'') +
        `\n📖 <i>${esc(m.Plot)}</i>` + FOOTER;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      if (m.Poster && m.Poster !== 'N/A') {
        await bot.sendPhoto(chatId, m.Poster, { caption:cap, parse_mode:'HTML' }).catch(() => sendText(bot, chatId, cap));
      } else {
        sendText(bot, chatId, cap);
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Movie not found: "<b>${esc(query)}</b>"\n\n<i>${esc(e.message)}</i>`);
    }
  });

  // ── /anime ────────────────────────────────────────────────────────────────────
  bot.onText(/\/anime(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/anime Naruto</code>`);

    const sent = await bot.sendMessage(chatId, `🎌 <b>Searching anime...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const a = await anime(query);
      const genres = (a.genres||[]).map(g=>g.name).join(', ') || 'N/A';
      const cap =
        `🎌 <b>${esc(a.title_english||a.title)}</b>\n<i>${esc(a.title)}</i>\n${DIV}\n\n` +
        `⭐ <b>Score:</b> ${a.score||'N/A'}/10  👥 ${(a.members||0).toLocaleString()}\n` +
        `📺 <b>Type:</b> ${esc(a.type||'N/A')}  📋 Episodes: <b>${a.episodes||'?'}</b>\n` +
        `📅 <b>Status:</b> ${esc(a.status||'N/A')}\n` +
        `🎭 <b>Genres:</b> ${esc(genres)}\n` +
        `📅 <b>Aired:</b> ${esc(a.aired?.string||'N/A')}\n\n` +
        `📖 <i>${esc((a.synopsis||'No synopsis.').slice(0,500))}${(a.synopsis||'').length>500?'...':''}</i>` + FOOTER;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      const img = a.images?.jpg?.large_image_url;
      if (img) {
        await bot.sendPhoto(chatId, img, { caption:cap, parse_mode:'HTML' }).catch(() => sendText(bot, chatId, cap));
      } else {
        sendText(bot, chatId, cap);
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Anime not found: "<b>${esc(query)}</b>"\n\n<i>${esc(e.message)}</i>\n\n💡 Try a more exact title.`);
    }
  });

  // ── /lyrics ───────────────────────────────────────────────────────────────────
  bot.onText(/\/lyrics(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/lyrics Shape of You</code>`);

    const sent = await bot.sendMessage(chatId, `🎵 <b>Finding lyrics...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const r = await lyrics(query);
      const body = esc(r.lyrics).slice(0, 3500);
      const cap = `🎵 <b>${esc(r.title)}</b>\n👤 ${esc(r.artist)}\n${DIV}\n\n${body}${r.lyrics.length>3500?'\n\n<i>… truncated</i>':''}` + FOOTER;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      if (r.cover) {
        await bot.sendPhoto(chatId, r.cover, { caption:cap, parse_mode:'HTML' }).catch(() => sendText(bot, chatId, cap));
      } else {
        sendText(bot, chatId, cap);
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Lyrics not found for "<b>${esc(query)}</b>"\n\n<i>${esc(e.message)}</i>\n\n💡 Try: Artist + Song title`);
    }
  });

  // ── /news ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/news(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, topic = (match[1]||'world').trim();
    const sent = await bot.sendMessage(chatId, `📰 <b>Fetching ${esc(topic)} news...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const articles = await news(topic);
      if (!articles.length) throw new Error('No articles found');

      let text = `📰 <b>Latest News — ${esc(topic)}</b>\n${DIV}\n\n`;
      for (let i = 0; i < Math.min(articles.length, 5); i++) {
        const a = articles[i];
        text += `<b>${i+1}.</b> ${esc(a.title)}\n`;
        if (a.url) text += `   <a href="${esc(a.url)}">Read more →</a>\n`;
        if (a.source?.name) text += `   📡 ${esc(a.source.name)}\n`;
        text += '\n';
      }
      text += FOOTER;
      edit(bot, chatId, sent.message_id, text);
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Could not fetch news: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /crypto ───────────────────────────────────────────────────────────────────
  bot.onText(/\/crypto/, async (msg) => {
    const sent = await bot.sendMessage(msg.chat.id, `📈 <b>Fetching crypto prices...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const data = await crypto();
      const COIN_EMOJI = { bitcoin:'₿', ethereum:'Ξ', binancecoin:'BNB', cardano:'ADA', solana:'SOL' };
      let text = `📈 <b>Live Crypto Prices</b>\n${DIV}\n\n`;
      for (const [coin, d] of Object.entries(data)) {
        const price  = d.usd?.toLocaleString('en-US', { style:'currency', currency:'USD', maximumFractionDigits: coin==='bitcoin'?0:4 }) || 'N/A';
        const change = d.usd_24h_change?.toFixed(2);
        const arrow  = change > 0 ? '🟢 ▲' : '🔴 ▼';
        text += `${COIN_EMOJI[coin]||'💰'} <b>${coin.toUpperCase()}</b>\n`;
        text += `   💵 ${price}  ${change ? `${arrow} ${Math.abs(change)}%` : ''}\n\n`;
      }
      text += `<i>Source: CoinGecko</i>` + FOOTER;
      edit(bot, msg.chat.id, sent.message_id, text);
    } catch (e) {
      edit(bot, msg.chat.id, sent.message_id, `❌ Crypto prices unavailable: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /github ───────────────────────────────────────────────────────────────────
  bot.onText(/\/github(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id, username = (match[1]||'').trim();
    if (!username) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/github username</code>\n<i>Example: /github torvalds</i>`);

    const sent = await bot.sendMessage(chatId, `🐙 <b>Looking up GitHub user...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const { user: u, repos: r } = await github(username);
      const cap =
        `🐙 <b>${esc(u.name || u.login)}</b>\n` +
        `<code>@${esc(u.login)}</code>\n${DIV}\n\n` +
        (u.bio ? `📝 ${esc(u.bio)}\n\n` : '') +
        `👥 <b>Followers:</b> ${u.followers?.toLocaleString()}  Following: ${u.following?.toLocaleString()}\n` +
        `📦 <b>Public Repos:</b> ${u.public_repos}\n` +
        (u.location ? `📍 ${esc(u.location)}\n` : '') +
        (u.company ? `🏢 ${esc(u.company)}\n` : '') +
        (u.blog ? `🔗 ${esc(u.blog)}\n` : '') +
        `📅 Joined: ${new Date(u.created_at).toDateString()}\n\n` +
        (r.length ? `⭐ <b>Top Repos:</b>\n` + r.map(repo => `  • <b>${esc(repo.name)}</b> ⭐${repo.stargazers_count} — <i>${esc((repo.description||'').slice(0,60))}</i>`).join('\n') : '') +
        FOOTER;

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      if (u.avatar_url) {
        await bot.sendPhoto(chatId, u.avatar_url, { caption:cap, parse_mode:'HTML' }).catch(() => sendText(bot, chatId, cap));
      } else {
        sendText(bot, chatId, cap);
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ GitHub user not found: "<b>${esc(username)}</b>"\n\n<i>${esc(e.message)}</i>`);
    }
  });

  // ── /urban ────────────────────────────────────────────────────────────────────
  bot.onText(/\/urban(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/urban slay</code>`);

    const sent = await bot.sendMessage(chatId, `📚 <b>Looking up definition...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const d = await urban(query);
      edit(bot, chatId, sent.message_id,
        `📚 <b>Urban Dictionary</b>\n${DIV}\n\n` +
        `📌 <b>${esc(d.word)}</b>\n\n` +
        `📖 ${esc(d.definition.slice(0, 600))}\n\n` +
        (d.example ? `💬 <i>${esc(d.example.slice(0, 300))}</i>\n\n` : '') +
        `👍 ${d.thumbs_up?.toLocaleString() || 0}` + FOOTER
      );
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ No definition for "<b>${esc(query)}</b>"\n\n<i>${esc(e.message)}</i>`);
    }
  });

  // ── /short ────────────────────────────────────────────────────────────────────
  bot.onText(/\/short(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id, url = (match[1]||'').trim();
    if (!url || !url.startsWith('http')) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/short https://yourlong.url/here</code>`);

    const sent = await bot.sendMessage(chatId, `🔗 <b>Shortening URL...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const short = await shorten(url);
      edit(bot, chatId, sent.message_id,
        `🔗 <b>URL Shortened</b>\n${DIV}\n\n` +
        `📎 <b>Short URL:</b>\n<code>${esc(short)}</code>\n\n` +
        `🔍 <b>Original:</b>\n<i>${esc(url.slice(0, 100))}${url.length>100?'...':''}</i>` + FOOTER
      );
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Could not shorten: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /ss ───────────────────────────────────────────────────────────────────────
  bot.onText(/\/ss(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id, url = (match[1]||'').trim();
    if (!url || !url.startsWith('http')) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/ss https://google.com</code>`);

    const w = cooldown(msg.from.id, 6000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `📸 <b>Taking screenshot...</b>\n<i>${esc(url.slice(0,60))}</i>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      await bot.sendChatAction(chatId, 'upload_photo').catch(() => {});
      let imgBuf = null;

      // Primary: siputzx (fast, full-page, desktop)
      try {
        const res = await axios.get('https://api.siputzx.my.id/api/tools/ssweb', {
          params: { url, theme: 'light', device: 'desktop' },
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: { accept: '*/*' },
        });
        const buf = Buffer.from(res.data);
        if (buf.length > 5000) imgBuf = buf;
      } catch {}

      // Fallback: screenshotmachine
      if (!imgBuf) {
        const res = await axios.get(screenshotUrl(url), { responseType: 'arraybuffer', timeout: 30000 });
        const buf = Buffer.from(res.data);
        if (buf.length > 5000) imgBuf = buf;
      }

      if (!imgBuf) throw new Error('Both screenshot APIs returned empty response');

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      await bot.sendPhoto(chatId, imgBuf, {
        caption: `📸 <b>Screenshot</b>\n🔗 ${esc(url.slice(0,80))}${url.length>80?'...':''}` + FOOTER,
        parse_mode: 'HTML',
      });
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Screenshot failed: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /joke ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/joke/, async (msg) => {
    const sent = await bot.sendMessage(msg.chat.id, `😂 <b>Getting a joke...</b>`, HTML).catch(() => null);
    if (!sent) return;
    try {
      const j = await joke();
      edit(bot, msg.chat.id, sent.message_id, `😂 <b>Joke</b> <i>(${esc(j.category)})</i>\n${DIV}\n\n${esc(j.joke)}` + FOOTER);
    } catch (e) { edit(bot, msg.chat.id, sent.message_id, `❌ ${esc(e.message)}`); }
  });

  // ── /quote ────────────────────────────────────────────────────────────────────
  bot.onText(/\/quote/, async (msg) => {
    const sent = await bot.sendMessage(msg.chat.id, `💬 <b>Getting a quote...</b>`, HTML).catch(() => null);
    if (!sent) return;
    try {
      const q = await quote();
      edit(bot, msg.chat.id, sent.message_id, `💬 <b>Quote</b>\n${DIV}\n\n❝ ${esc(q.text)} ❞\n\n— <i>${esc(q.author)}</i>` + FOOTER);
    } catch (e) { edit(bot, msg.chat.id, sent.message_id, `❌ ${esc(e.message)}`); }
  });

  // ── /fact ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/fact/, async (msg) => {
    const sent = await bot.sendMessage(msg.chat.id, `🧠 <b>Loading fact...</b>`, HTML).catch(() => null);
    if (!sent) return;
    try {
      const f = await fact();
      edit(bot, msg.chat.id, sent.message_id, `🧠 <b>Random Fact</b>\n${DIV}\n\n${esc(f)}` + FOOTER);
    } catch (e) { edit(bot, msg.chat.id, sent.message_id, `❌ ${esc(e.message)}`); }
  });

  // ── /qr ───────────────────────────────────────────────────────────────────────
  bot.onText(/\/qr(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, text = (match[1]||'').trim();
    if (!text) return sendText(bot, chatId, `❌ <b>Usage:</b> <code>/qr your text or URL</code>`);
    await bot.sendChatAction(chatId, 'upload_photo').catch(() => {});
    try {
      await bot.sendPhoto(chatId, qrUrl(text), {
        caption: `📱 <b>QR Code</b>\n${DIV}\n\nContent: <code>${esc(text.slice(0,200))}</code>` + FOOTER,
        parse_mode: 'HTML',
      });
    } catch (e) { sendText(bot, chatId, `❌ QR generation failed: ${esc(e.message)}`); }
  });

  // ── /meme ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/meme/, async (msg) => {
    await bot.sendChatAction(msg.chat.id, 'upload_photo').catch(() => {});
    try {
      const m = await randomMeme();
      await bot.sendPhoto(msg.chat.id, m.url, {
        caption:
          `😂 <b>${esc((m.title||'Meme').slice(0,100))}</b>\n${DIV}\n` +
          (m.subreddit ? `\n📌 r/${esc(m.subreddit)}  ` : '') +
          (m.ups ? `👍 ${m.ups.toLocaleString()}` : '') +
          FOOTER,
        parse_mode: 'HTML',
      }).catch(async () => {
        // Non-image (video/gif) — send as document
        await bot.sendDocument(msg.chat.id, m.url, {
          caption: `😂 <b>${esc((m.title||'Meme').slice(0,100))}</b>` + FOOTER,
          parse_mode: 'HTML',
        }).catch(() => sendText(bot, msg.chat.id, `😂 <a href="${esc(m.url)}">Open meme</a>` + FOOTER));
      });
    } catch (e) {
      sendText(bot, msg.chat.id, `❌ Could not fetch meme: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /calc ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/calc(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, expr = (match[1]||'').trim();
    if (!expr) return sendText(bot, chatId,
      `🧮 <b>Calculator</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/calc expression</code>\n\n` +
      `<b>Examples:</b>\n` +
      `• <code>/calc 25 * 4 + 10</code>\n` +
      `• <code>/calc (100/3) * 7</code>\n` +
      `• <code>/calc 2^10</code>\n` +
      `• <code>/calc √144</code>\n\n` +
      `Supports: + - * / % ^ √ ( )` + FOOTER
    );
    try {
      const { result } = calcExpr(expr);
      sendText(bot, chatId,
        `🧮 <b>Calculator</b>\n${DIV}\n\n` +
        `📝 <code>${esc(expr)}</code>\n\n` +
        `✅ <b>= ${esc(String(result))}</b>` + FOOTER
      );
    } catch (e) {
      sendText(bot, chatId, `❌ <b>Calculation failed</b>\n\n<i>${esc(e.message)}</i>\n\nExample: <code>/calc 25 * 4 + 10</code>`);
    }
  });

  // ── /currency ─────────────────────────────────────────────────────────────────
  bot.onText(/\/currency(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const parts  = (match[1]||'').trim().split(/\s+/);
    if (parts.length < 3) return sendText(bot, chatId,
      `💱 <b>Currency Converter</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/currency amount FROM TO</code>\n\n` +
      `<b>Examples:</b>\n` +
      `• <code>/currency 100 USD PKR</code>\n` +
      `• <code>/currency 50 EUR USD</code>\n` +
      `• <code>/currency 1000 SAR PKR</code>\n\n` +
      `Common: USD EUR GBP PKR SAR AED INR TRY JPY` + FOOTER
    );
    const amount = parseFloat(parts[0]);
    if (isNaN(amount)) return sendText(bot, chatId, `❌ Invalid amount: <code>${esc(parts[0])}</code>`);

    const sent = await bot.sendMessage(chatId, `💱 <b>Converting...</b>`, HTML).catch(() => null);
    if (!sent) return;
    try {
      const r = await currencyConvert(amount, parts[1], parts[2]);
      edit(bot, chatId, sent.message_id,
        `💱 <b>Currency Converter</b>\n${DIV}\n\n` +
        `💵 <b>${esc(r.amount.toLocaleString())} ${esc(r.from)}</b>\n` +
        `↓\n` +
        `💰 <b>${esc(r.result.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })) } ${esc(r.to)}</b>\n\n` +
        `📊 Rate: 1 ${esc(r.from)} = ${esc(r.rate.toFixed(4))} ${esc(r.to)}\n` +
        `<i>Source: ExchangeRate-API</i>` + FOOTER
      );
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Conversion failed: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /time ─────────────────────────────────────────────────────────────────────
  bot.onText(/\/time(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id, query = (match[1]||'').trim();
    if (!query) return sendText(bot, chatId,
      `🕐 <b>World Clock</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/time city or timezone</code>\n\n` +
      `<b>Examples:</b>\n` +
      `• <code>/time Karachi</code>\n` +
      `• <code>/time London</code>\n` +
      `• <code>/time Dubai</code>\n` +
      `• <code>/time New_York</code>\n` +
      `• <code>/time Tokyo</code>` + FOOTER
    );
    const sent = await bot.sendMessage(chatId, `🌍 <b>Looking up time...</b>`, HTML).catch(() => null);
    if (!sent) return;
    try {
      const t = await worldTime(query);
      const dt     = new Date(t.datetime);
      const time   = dt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: true });
      const date   = dt.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
      const offset = t.utc_offset || '';
      edit(bot, chatId, sent.message_id,
        `🕐 <b>World Clock</b>\n${DIV}\n\n` +
        `📍 <b>${esc(t.tz.replace(/_/g,' '))}</b>\n\n` +
        `🕐 <b>${esc(time)}</b>\n` +
        `📅 ${esc(date)}\n` +
        (offset ? `🌐 UTC ${esc(offset)}\n` : '') +
        (t.abbreviation ? `🔤 ${esc(t.abbreviation)}\n` : '') +
        (t.dst ? `☀️ Daylight Saving Time active\n` : '') +
        FOOTER
      );
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ ${esc(e.message)}`);
    }
  });

  // ── /password ─────────────────────────────────────────────────────────────────
  bot.onText(/\/password(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const args   = (match[1]||'').trim().split(/\s+/);
    const len    = parseInt(args[0]) || 16;
    const type   = args[1]?.toLowerCase() === 'pin' ? 'pin' : args[1]?.toLowerCase() === 'simple' ? 'simple' : 'strong';

    try {
      const { password, length, strength } = genPassword(len, type);
      const STRENGTH_BAR = { pin: '🔐 PIN', simple: '🔑 Simple', strong: '🛡 Strong' };
      sendText(bot, chatId,
        `🔐 <b>Password Generator</b>\n${DIV}\n\n` +
        `<code>${esc(password)}</code>\n\n` +
        `📏 Length: <b>${length}</b>\n` +
        `${STRENGTH_BAR[strength] || '🛡 Strong'}\n\n` +
        `<i>Tap the password to copy it</i>\n\n` +
        `<b>Usage:</b> <code>/password [length] [pin|simple|strong]</code>\n` +
        `Examples: <code>/password 20</code>  <code>/password 6 pin</code>` + FOOTER
      );
    } catch (e) {
      sendText(bot, chatId, `❌ ${esc(e.message)}`);
    }
  });

  // ── /twitter ──────────────────────────────────────────────────────────────────
  bot.onText(/\/(?:twitter|tw|xdl)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let url = (match[1] || '').trim();
    if (!url) return sendText(bot, chatId,
      `🐦 <b>Twitter/X Downloader</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/twitter https://x.com/user/status/…</code>\n\n` +
      `Supports video and images from public tweets.` + FOOTER
    );
    if (!TW_RX.test(url)) return sendText(bot, chatId, `❌ Please send a valid Twitter/X status link.\n\nExample: <code>/twitter https://x.com/user/status/123</code>`);
    url = url.match(TW_RX)[0];

    await bot.sendChatAction(chatId, 'upload_video').catch(() => {});
    try {
      const r = await twDl(url);
      const cap =
        `🐦 <b>Twitter / X</b>\n${DIV}\n\n` +
        (r.author ? `👤 @${esc(r.author)}\n` : '') +
        (r.text   ? `💬 ${esc(r.text.slice(0, 300))}\n` : '') +
        FOOTER;

      if (r.type === 'video') {
        const buf = await downloadBuffer(r.url, 49);
        await bot.sendVideo(chatId, buf, { caption: cap, parse_mode: 'HTML', supports_streaming: true });
      } else {
        await bot.sendPhoto(chatId, r.url, { caption: cap, parse_mode: 'HTML' });
      }
    } catch (e) {
      sendText(bot, chatId, `❌ <b>Twitter download failed</b>\n\n<i>${esc(e.message)}</i>\n\nMake sure the tweet is public and has video/image.`);
    }
  });

  // ── /pin ──────────────────────────────────────────────────────────────────────
  bot.onText(/\/(?:pin|pinterest)\b(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let url = (match[1] || '').trim();
    if (!url) return sendText(bot, chatId,
      `📌 <b>Pinterest Downloader</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/pin https://pin.it/…</code>\n\n` +
      `Supports images and video pins.` + FOOTER
    );
    if (!PIN_RX.test(url)) return sendText(bot, chatId, `❌ Please send a valid Pinterest link.`);
    url = url.match(PIN_RX)[0].replace(/[.,!?;]$/, '');

    await bot.sendChatAction(chatId, 'upload_photo').catch(() => {});
    try {
      const r = await pinDl(url);
      const cap = `📌 <b>Pinterest</b>` + FOOTER;
      const buf = await downloadBuffer(r.url, 49);

      if (r.type === 'video') {
        await bot.sendVideo(chatId, buf, { caption: cap, parse_mode: 'HTML', supports_streaming: true });
      } else {
        await bot.sendPhoto(chatId, buf, { caption: cap, parse_mode: 'HTML' });
      }
    } catch (e) {
      sendText(bot, chatId, `❌ <b>Pinterest download failed</b>\n\n<i>${esc(e.message)}</i>`);
    }
  });

  // ── /threads ──────────────────────────────────────────────────────────────────
  bot.onText(/\/(?:threads|th)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let url = (match[1] || '').trim();
    if (!url) return sendText(bot, chatId,
      `🧵 <b>Threads Downloader</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/threads https://threads.net/p/…</code>\n\n` +
      `Supports video and images from public Threads posts.` + FOOTER
    );
    if (!TH_RX.test(url)) return sendText(bot, chatId, `❌ Please send a valid Threads link.`);
    url = url.match(TH_RX)[0].replace(/[.,!?;]$/, '');

    await bot.sendChatAction(chatId, 'upload_video').catch(() => {});
    try {
      const r = await threadsDl(url);
      const cap = `🧵 <b>Threads</b>` + FOOTER;
      const buf = await downloadBuffer(r.url, 49);

      if (r.type === 'video') {
        await bot.sendVideo(chatId, buf, { caption: cap, parse_mode: 'HTML', supports_streaming: true });
      } else {
        await bot.sendPhoto(chatId, buf, { caption: cap, parse_mode: 'HTML' });
      }
    } catch (e) {
      sendText(bot, chatId, `❌ <b>Threads download failed</b>\n\n<i>${esc(e.message)}</i>`);
    }
  });

  // ── /spotify ──────────────────────────────────────────────────────────────────
  bot.onText(/\/(?:spotify|spot|spdl)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let url = (match[1] || '').trim();
    if (!url) return sendText(bot, chatId,
      `🎵 <b>Spotify Downloader</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/spotify https://open.spotify.com/track/…</code>\n\n` +
      `Supports tracks and playlists (first 5 songs).` + FOOTER
    );
    const m = url.match(SP_RX);
    if (!m) return sendText(bot, chatId, `❌ Please send a valid Spotify track or playlist link.`);

    const sent = await bot.sendMessage(chatId, `🎵 <b>Fetching Spotify track…</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      const [type, id] = [m[1], m[2]];

      const processTrack = async (trackId, trackTitle = 'Unknown', trackArtist = 'Unknown', cover = null) => {
        let title = trackTitle, artist = trackArtist;
        // Fetch metadata
        try {
          const meta = await spotifyMeta(trackId);
          title  = meta?.title   || title;
          artist = meta?.artists || meta?.artist || artist;
          cover  = meta?.cover   || cover;
        } catch {}

        // Send cover preview
        if (cover) {
          await bot.sendPhoto(chatId, cover, {
            caption: `🎵 <b>${esc(title)}</b>\n👤 ${esc(artist)}\n\n⏳ <i>Downloading…</i>` + FOOTER,
            parse_mode: 'HTML',
          }).catch(() => {});
        }

        let link = null;
        try { const dl = await spotifyDownload(trackId); link = dl.link; } catch {}

        if (!link) throw new Error('Could not download — Spotify region restriction or private track');

        const buf = await downloadBuffer(link, 49);
        await bot.sendAudio(chatId, buf, {
          caption: `🎵 <b>${esc(title)}</b>\n👤 ${esc(artist)}` + FOOTER,
          parse_mode: 'HTML',
          title,
          performer: artist,
        });
      };

      if (type === 'track') {
        await edit(bot, chatId, sent.message_id, `🎵 <b>Downloading track…</b>`);
        await processTrack(id);
        bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      } else if (type === 'playlist') {
        const tracks = await spotifyPlaylistTracks(id);
        if (!tracks.length) throw new Error('Playlist is empty or private');
        await edit(bot, chatId, sent.message_id, `🎵 <b>Sending ${tracks.length} tracks from playlist…</b>`);
        for (const t of tracks) {
          try { await processTrack(t.id, t.title, t.artists); } catch {}
        }
        bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      } else {
        edit(bot, chatId, sent.message_id, `❌ Albums not supported — use a track or playlist link.`);
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ <b>Spotify failed</b>\n\n<i>${esc(e.message)}</i>`);
    }
  });

  // ── /reddit ───────────────────────────────────────────────────────────────────
  bot.onText(/\/(?:reddit|rdl)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let url = (match[1] || '').trim();
    if (!url) return sendText(bot, chatId,
      `🟠 <b>Reddit Downloader</b>\n${DIV}\n\n` +
      `<b>Usage:</b> <code>/reddit https://reddit.com/r/…</code>\n\n` +
      `Supports videos, images, and galleries from public posts.` + FOOTER
    );
    if (!RD_RX.test(url)) return sendText(bot, chatId, `❌ Please send a valid Reddit post link.\n\nExample: <code>/reddit https://reddit.com/r/funny/comments/…</code>`);
    url = url.match(RD_RX)[0];

    await bot.sendChatAction(chatId, 'upload_photo').catch(() => {});
    try {
      const r = await redditDl(url);
      const meta =
        (r.subreddit ? `📌 ${esc(r.subreddit)}\n` : '') +
        (r.title     ? `📝 ${esc(r.title.slice(0, 200))}\n` : '') +
        (r.ups       ? `👍 ${r.ups.toLocaleString()}\n` : '');
      const cap = `🟠 <b>Reddit</b>\n${DIV}\n\n${meta}` + FOOTER;

      if (r.type === 'video') {
        await bot.sendChatAction(chatId, 'upload_video').catch(() => {});
        const buf = await downloadBuffer(r.url, 49);
        await bot.sendVideo(chatId, buf, { caption: cap, parse_mode: 'HTML', supports_streaming: true });
      } else if (r.type === 'image') {
        await bot.sendPhoto(chatId, r.url, { caption: cap, parse_mode: 'HTML' });
      } else if (r.type === 'gallery') {
        // Send first image with caption, rest as album
        const media = r.images.slice(0, 10).map((u, i) => ({
          type: 'photo', media: u,
          ...(i === 0 ? { caption: cap, parse_mode: 'HTML' } : {}),
        }));
        await bot.sendMediaGroup(chatId, media).catch(async () => {
          // Fallback: send individually
          for (const u of r.images.slice(0, 4)) {
            await bot.sendPhoto(chatId, u).catch(() => {});
          }
        });
      } else {
        sendText(bot, chatId, `🟠 <b>Reddit Post</b>\n${DIV}\n\n${meta}🔗 <a href="${esc(r.url)}">Open Link</a>` + FOOTER);
      }
    } catch (e) {
      sendText(bot, chatId, `❌ <b>Reddit download failed</b>\n\n<i>${esc(e.message)}</i>`);
    }
  });

  // ── /sticker ──────────────────────────────────────────────────────────────────
  bot.onText(/\/sticker(?:\s+(\S+))?/, async (msg, match) => {
    const chatId    = msg.chat.id;
    const urlArg    = (match[1] || '').trim();
    const replyDoc  = msg.reply_to_message?.document;
    const replyPhoto = msg.reply_to_message?.photo;

    if (!urlArg && !replyPhoto && !replyDoc) return sendText(bot, chatId,
      `🎭 <b>Sticker Maker</b>\n${DIV}\n\n` +
      `<b>Usage:</b>\n` +
      `• <code>/sticker https://image-url.com</code>\n` +
      `• Reply to any photo with <code>/sticker</code>\n\n` +
      `<i>Converts any image (JPG/PNG/WebP) into a Telegram sticker</i>` + FOOTER
    );

    const w = cooldown(msg.from.id, 5000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `🎭 <b>Creating sticker...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      await bot.sendChatAction(chatId, 'upload_document').catch(() => {});

      let imgBuf;
      if (urlArg) {
        imgBuf = await downloadBuffer(urlArg, 10);
      } else if (replyPhoto) {
        const photo = replyPhoto[replyPhoto.length - 1];
        const file  = await bot.getFile(photo.file_id);
        imgBuf = await downloadBuffer(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`, 10);
      } else {
        const file = await bot.getFile(replyDoc.file_id);
        imgBuf = await downloadBuffer(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`, 10);
      }

      // Convert to 512×512 WebP via ffmpeg (available on the server)
      const tmpIn  = nodePath.join(os.tmpdir(), `stk_in_${Date.now()}.bin`);
      const tmpOut = nodePath.join(os.tmpdir(), `stk_out_${Date.now()}.webp`);
      let webpBuf  = null;
      try {
        await fs.writeFile(tmpIn, imgBuf);
        await execFileAsync('ffmpeg', [
          '-i', tmpIn,
          '-vf', "scale='if(gt(iw,ih),512,-2)':'if(gt(ih,iw),512,-2)',pad=512:512:(512-iw)/2:(512-ih)/2:color=white@0",
          '-y', tmpOut,
        ], { timeout: 30000 });
        const stat = await fs.stat(tmpOut).catch(() => null);
        if (stat?.size > 0) webpBuf = await fs.readFile(tmpOut);
      } catch {} finally {
        fs.unlink(tmpIn).catch(() => {});
        fs.unlink(tmpOut).catch(() => {});
      }

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      if (webpBuf) {
        await bot.sendSticker(chatId, webpBuf).catch(async () => {
          await bot.sendDocument(chatId, webpBuf, { caption: `🎭 <b>Sticker (WebP)</b>` + FOOTER, parse_mode: 'HTML' });
        });
      } else {
        // ffmpeg failed — send original as sticker attempt
        await bot.sendSticker(chatId, imgBuf).catch(async () => {
          await bot.sendDocument(chatId, imgBuf, { caption: `🎭 <b>Image (sticker conversion failed — download and add manually)</b>` + FOOTER, parse_mode: 'HTML' });
        });
      }
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ Sticker creation failed: <i>${esc(e.message)}</i>`);
    }
  });

  // ── /ocr ──────────────────────────────────────────────────────────────────────
  bot.onText(/\/ocr(?:\s+(\S+))?/, async (msg, match) => {
    const chatId    = msg.chat.id;
    const urlArg    = (match[1] || '').trim();
    const replyPhoto = msg.reply_to_message?.photo;
    const replyDoc  = msg.reply_to_message?.document;

    if (!urlArg && !replyPhoto && !replyDoc) return sendText(bot, chatId,
      `🔍 <b>OCR — Image Text Extractor</b>\n${DIV}\n\n` +
      `<b>Usage:</b>\n` +
      `• <code>/ocr https://image-url.com</code>\n` +
      `• Reply to any photo with <code>/ocr</code>\n\n` +
      `<i>Extracts text from screenshots, photos, documents</i>` + FOOTER
    );

    const w = cooldown(msg.from.id, 6000);
    if (w) return sendText(bot, chatId, `⏳ Please wait <b>${w}s</b>.`);

    const sent = await bot.sendMessage(chatId, `🔍 <b>Reading image text...</b>`, HTML).catch(() => null);
    if (!sent) return;

    try {
      await bot.sendChatAction(chatId, 'typing').catch(() => {});

      let imageUrl = urlArg;

      // If reply to photo/doc, get the Telegram file URL
      if (!imageUrl) {
        const fileId = replyPhoto
          ? replyPhoto[replyPhoto.length - 1].file_id
          : replyDoc.file_id;
        const file  = await bot.getFile(fileId);
        imageUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
      }

      // ocr.space free API — 25k requests/month, no signup needed with key 'helloworld'
      const { data } = await axios.post(
        'https://api.ocr.space/parse/image',
        new URLSearchParams({ url: imageUrl, apikey: 'helloworld', language: 'eng', isOverlayRequired: 'false' }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
      );

      const result = data?.ParsedResults?.[0]?.ParsedText?.trim();
      if (!result) throw new Error(data?.ErrorMessage?.[0] || 'No text found in image');

      await bot.deleteMessage(chatId, sent.message_id).catch(() => {});
      sendText(bot, chatId,
        `🔍 <b>Extracted Text</b>\n${DIV}\n\n` +
        `${esc(result.slice(0, 3500))}${result.length > 3500 ? '\n\n<i>…truncated</i>' : ''}` + FOOTER
      );
    } catch (e) {
      edit(bot, chatId, sent.message_id, `❌ OCR failed: <i>${esc(e.message)}</i>\n\n💡 Make sure the image contains clear, readable text.`);
    }
  });

  // ── Catch-all ─────────────────────────────────────────────────────────────────
  const KNOWN = /^\/(start|help|ping|id|play|video|tiktok|ig|fb|ai|imagine|weather|translate|wiki|movie|anime|lyrics|news|crypto|github|urban|short|ss|joke|quote|fact|qr|meme|calc|currency|time|password|twitter|tw|xdl|pin|pinterest|threads|th|spotify|spot|spdl|reddit|rdl|sticker|ocr)/;
  bot.on('message', (msg) => {
    if (msg.text?.startsWith('/') && !KNOWN.test(msg.text)) {
      sendText(bot, msg.chat.id, `❓ Unknown command.\n\nType /help to see all commands.`);
    }
  });

  bot.on('polling_error', (err) => {
    logger.warn({ code: err.code, msg: err.message }, '🤖 Telegram features polling error');
  });

  logger.info('🤖 Telegram features bot started (v2 — advanced)');
  return bot;
}
