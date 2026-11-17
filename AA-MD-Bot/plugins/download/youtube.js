// ============================================
// AA MD Bot - YouTube Downloader (v4 - TURBO)
// Developer: Ahsan Ali Wadani
// Flow: command → downloads START IMMEDIATELY (in parallel with the info card)
//       → hedged provider race (fast ones first, slow ones only if needed)
//       → RAM cache + in-flight sharing → plain audio/video (no ad-card)
// ============================================

import axios from "axios";
import http from "node:http";
import https from "node:https";

// ── Config (all overridable from .env) ───────────────────────────────────────
function numEnv(name, fallback, min = 0) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? v : fallback;
}

const PROVIDER_TIMEOUT = numEnv("YT_PROVIDER_TIMEOUT_MS", 30000, 1000);
const AUDIO_DL_TIMEOUT = numEnv("YT_AUDIO_DOWNLOAD_TIMEOUT_MS", 90000, 1000);
const VIDEO_DL_TIMEOUT = numEnv("YT_VIDEO_DOWNLOAD_TIMEOUT_MS", 120000, 1000);
const DEADLINE_MS = numEnv("YT_TOTAL_DEADLINE_MS", 170000, 5000); // hard cap per job
const HEDGE_MS = numEnv("YT_HEDGE_MS", 1200, 0); // 0 = start all providers at once
const VIDEO_RES = process.env.YT_VIDEO_QUALITY || "720"; // 360 / 480 / 720 / 1080
const MAX_AUDIO_MIN = numEnv("YT_MAX_AUDIO_MIN", 120, 1);
const MAX_VIDEO_MIN = numEnv("YT_MAX_VIDEO_MIN", 45, 1);
const MAX_AUDIO_BYTES = numEnv("YT_MAX_AUDIO_MB", 60, 1) * 1024 * 1024;
const MAX_VIDEO_BYTES = numEnv("YT_MAX_VIDEO_MB", 150, 1) * 1024 * 1024;
const DOC_THRESHOLD = 64 * 1024 * 1024; // bigger videos are sent as document
const CACHE_TTL = numEnv("YT_CACHE_TTL_MS", 15 * 60 * 1000, 0);
const CACHE_MAX_BYTES = numEnv("YT_CACHE_MAX_MB", 150, 0) * 1024 * 1024;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// One shared client with keep-alive → no TCP/TLS handshake on every call
const api = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 64 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 64 }),
});

// ── URL helpers ──────────────────────────────────────────────────────────────
const YT_REGEX =
  /(https?:\/\/(?:(?:www|m|music)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]+\S*)/i;
const YT_ID_RE =
  /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/|embed\/))([\w-]{11})/i;

const extractUrl = (t) => {
  if (!t) return null;
  const m = t.match(YT_REGEX);
  return m ? m[1] : null;
};
const extractVideoId = (u) => (u ? (u.match(YT_ID_RE) || [])[1] || null : null);
// Canonical URL: strips tracking params / playlists that confuse providers
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// ── Small utils ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function firstSuccess(promises) {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (!pending) return resolve(null);
    for (const p of promises) {
      Promise.resolve(p)
        .then((v) => {
          if (v) resolve(v);
        })
        .catch(() => {})
        .finally(() => {
          if (--pending === 0) resolve(null);
        });
    }
  });
}

function parseDuration(d) {
  if (!d) return 0;
  if (typeof d === "object") d = d.timestamp || d.seconds || 0;
  if (typeof d === "number") return d;
  const s = String(d).trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d+(:\d+){1,2}$/.test(s)) return s.split(":").reduce((a, b) => a * 60 + Number(b), 0);
  return 0;
}

function formatDuration(d) {
  if (!d) return "N/A";
  if (typeof d === "object") return d.timestamp || d.seconds || "N/A";
  if (typeof d === "number") {
    const h = Math.floor(d / 3600),
      m = Math.floor((d % 3600) / 60),
      s = Math.floor(d % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }
  return String(d);
}

// Final "K/M/B views" text. Sources must hand it a raw number or an already
// abbreviated string ("1.2M") - both are handled without being mangled.
function formatViews(v) {
  if (v === undefined || v === null || v === "") return "N/A";
  if (typeof v === "string") {
    const already = v.trim().match(/^([\d,.]+)\s*([kKmMbB])\b/);
    if (already) return `${already[1]}${already[2].toUpperCase()} views`;
  }
  let n = v;
  if (typeof n === "string") n = Number(n.replace(/[^0-9.]/g, ""));
  if (!n || isNaN(n)) return typeof v === "string" && v.trim() ? v : "N/A";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B views";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M views";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K views";
  return n + " views";
}

function safeFileName(title, ext) {
  const base = String(title || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "youtube"}.${ext}`;
}

function audioMime(ct) {
  const c = String(ct || "").toLowerCase();
  if (c.includes("mp4") || c.includes("m4a") || c.includes("aac")) return { mime: "audio/mp4", ext: "m4a" };
  if (c.includes("ogg") || c.includes("opus")) return { mime: "audio/ogg; codecs=opus", ext: "ogg" };
  return { mime: "audio/mpeg", ext: "mp3" };
}

// ── Provider health stats (better providers get tried first) ─────────────────
const stats = new Map();
function recordStat(name, ok) {
  const s = stats.get(name) || { ok: 0, fail: 0 };
  ok ? s.ok++ : s.fail++;
  if (s.ok + s.fail > 20) {
    s.ok = Math.floor(s.ok / 2);
    s.fail = Math.floor(s.fail / 2);
  }
  stats.set(name, s);
}
const providerScore = (name) => {
  const s = stats.get(name) || { ok: 0, fail: 0 };
  return (s.ok + 1) / (s.ok + s.fail + 2);
};
const sortByHealth = (list) => [...list].sort((a, b) => providerScore(b.name) - providerScore(a.name));

// ── Providers ────────────────────────────────────────────────────────────────
const AUDIO_PROVIDERS = [
  { name: "nexray-mp3", file: "audio.mp3", url: (e) => `https://api.nexray.eu.cc/downloader/v1/ytmp3?url=${e}` },
  { name: "abz-v3", file: "audio.mp3", url: (e) => `https://api-abztech.zone.id/download/ytdlv3?url=${e}` },
  { name: "elite-mp3", file: "audio.mp3", url: (e) => `https://eliteprotech-apis.zone.id/ytdown?url=${e}&format=mp3` },
];

const VIDEO_PROVIDERS = [
  {
    name: "nexray-mp4",
    file: "video.mp4",
    url: (e) => `https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${e}&resolusi=${VIDEO_RES}`,
  },
  { name: "elite-mp4", file: "video.mp4", url: (e) => `https://eliteprotech-apis.zone.id/ytdown?url=${e}&format=mp4` },
  { name: "abz-v4", file: "video.mp4", url: (e) => `https://api-abztech.zone.id/download/ytdl4?url=${e}` },
];

// Every provider uses a slightly different JSON shape - one tolerant parser
function pickUrl(d) {
  const r = d?.result ?? d;
  const cands = [
    r?.downloadURL,
    r?.downloadUrl,
    r?.download_url,
    r?.url,
    r?.link,
    d?.downloadURL,
    d?.downloadUrl,
    d?.download_url,
    d?.url,
    r?.result?.url,
  ];
  return cands.find((u) => typeof u === "string" && /^https?:\/\//i.test(u)) || null;
}

async function fetchProviderLink(p, enc, signal) {
  const { data: d } = await api.get(p.url(enc), { timeout: PROVIDER_TIMEOUT, signal });
  if (d?.status === false || d?.success === false) return null;
  const url = pickUrl(d);
  if (!url) return null;
  const r = d?.result ?? d;
  return { url, title: r?.title || d?.title || "", filename: r?.filename || d?.filename || p.file, provider: p.name };
}

// ── Buffer downloader (2 header strategies, only retries on HTTP rejections) ─
async function tryDownload(url, timeout, signal, maxBytes) {
  const attempts = [{ "User-Agent": UA, Referer: "https://www.youtube.com/", Accept: "*/*" }, {}];

  for (const headers of attempts) {
    if (signal?.aborted) return null;
    try {
      const res = await api.get(url, {
        responseType: "arraybuffer",
        timeout,
        maxRedirects: 10,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        validateStatus: (s) => s >= 200 && s < 300,
        signal,
        headers,
      });
      const ct = String(res.headers?.["content-type"] || "").toLowerCase();
      // server returned an error page instead of media → try next header set
      if (/text\/|application\/json|application\/xml/.test(ct)) continue;
      const buf = Buffer.from(res.data);
      if (buf.length) return { buf, contentType: ct };
    } catch (e) {
      if (axios.isCancel(e) || signal?.aborted) return null;
      if (/maxContentLength|maxBodyLength/i.test(e.message || "")) return null; // too big, pointless to retry
      if (!e.response) return null; // timeout / network error → UA change won't help
      console.error("[YT download attempt failed]", e.response.status);
    }
  }
  return null;
}

// ── Hedged race ──────────────────────────────────────────────────────────────
// Provider #1 starts immediately. Provider #2 starts after HEDGE_MS (or at once
// if #1 already failed), and so on. First valid media buffer wins and every
// other request is aborted. Fast AND doesn't hammer all APIs on every command.
function raceDownload(tasks, { signal, hedgeMs, timeout, minSize, maxBytes }) {
  return new Promise((resolve) => {
    const ctl = new AbortController();
    let settled = false;
    let next = 0;
    let running = 0;
    let timer = null;

    const done = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      ctl.abort();
      resolve(res);
    };
    const onAbort = () => done(null);
    if (signal?.aborted) return done(null);
    signal?.addEventListener("abort", onAbort, { once: true });

    const runTask = async (t) => {
      try {
        const cand = await t.resolve(ctl.signal);
        if (!cand?.url || settled) {
          if (!cand?.url) recordStat(t.name, false);
          return null;
        }
        const dl = await tryDownload(cand.url, timeout, ctl.signal, maxBytes);
        if (!dl || dl.buf.length < minSize) {
          if (!settled) recordStat(t.name, false);
          return null;
        }
        recordStat(t.name, true);
        return { buf: dl.buf, contentType: dl.contentType, meta: cand };
      } catch {
        if (!settled) recordStat(t.name, false);
        return null;
      }
    };

    const startNext = () => {
      if (settled || next >= tasks.length) return;
      const t = tasks[next++];
      running++;
      clearTimeout(timer);
      if (next < tasks.length) timer = setTimeout(startNext, hedgeMs);
      runTask(t).then((res) => {
        running--;
        if (settled) return;
        if (res) return done(res);
        if (running === 0) {
          if (next >= tasks.length) done(null);
          else startNext(); // everything so far failed → don't wait for the hedge timer
        }
      });
    };

    startNext();
  });
}

// ── Media job: cache + in-flight sharing + ref-counted abort ─────────────────
const cache = new Map(); // key -> { result, ts, size }
let cacheBytes = 0;
const inflight = new Map(); // key -> { ctl, refs, promise }

function cacheDelete(key) {
  const e = cache.get(key);
  if (e) {
    cacheBytes -= e.size;
    cache.delete(key);
  }
}
function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) {
    cacheDelete(key);
    return null;
  }
  return e.result;
}
function cacheSet(key, result) {
  if (!CACHE_TTL || !CACHE_MAX_BYTES) return;
  const size = result.buf.length;
  if (size > CACHE_MAX_BYTES / 2) return;
  cacheDelete(key);
  cache.set(key, { result, ts: Date.now(), size });
  cacheBytes += size;
  while (cacheBytes > CACHE_MAX_BYTES && cache.size > 1) cacheDelete(cache.keys().next().value);
}

async function runMedia(ytUrl, type, directAudioUrl, signal) {
  const isVideo = type === "video";
  const enc = encodeURIComponent(ytUrl);
  const opts = {
    signal,
    hedgeMs: HEDGE_MS,
    timeout: isVideo ? VIDEO_DL_TIMEOUT : AUDIO_DL_TIMEOUT,
    minSize: isVideo ? 50000 : 10000,
    maxBytes: isVideo ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES,
  };

  const tasks = sortByHealth(isVideo ? VIDEO_PROVIDERS : AUDIO_PROVIDERS).map((p) => ({
    name: p.name,
    resolve: (sig) => fetchProviderLink(p, enc, sig),
  }));

  // free fast-path: ready-made audio link that NexRay's ytplay search returned
  if (!isVideo && directAudioUrl) {
    tasks.unshift({
      name: "nexray-direct",
      resolve: async () => ({ url: directAudioUrl, title: "", filename: "audio.mp3", provider: "nexray-direct" }),
    });
  }

  for (let round = 0; round < 2 && !signal.aborted; round++) {
    const r = await raceDownload(tasks, opts);
    if (r) return r;
    if (round === 0) await sleep(700);
  }
  return null;
}

function startMedia(key, ytUrl, type, directAudioUrl) {
  const hit = cacheGet(key);
  if (hit) return { promise: Promise.resolve(hit), release() {}, cached: true };

  let job = inflight.get(key);
  if (!job) {
    const ctl = new AbortController();
    const deadline = setTimeout(() => ctl.abort(), DEADLINE_MS);
    job = { ctl, refs: 0, promise: null };
    job.promise = runMedia(ytUrl, type, directAudioUrl, ctl.signal)
      .catch(() => null)
      .then((res) => {
        clearTimeout(deadline);
        inflight.delete(key);
        if (res) cacheSet(key, res);
        return res;
      });
    inflight.set(key, job);
  }

  job.refs++;
  let released = false;
  return {
    promise: job.promise,
    cached: false,
    release() {
      if (released) return;
      released = true;
      if (--job.refs <= 0) job.ctl.abort(); // nobody is waiting anymore → stop wasting bandwidth
    },
  };
}

// ── Metadata ─────────────────────────────────────────────────────────────────
const searchCache = new Map();
const SEARCH_TTL = 10 * 60 * 1000;

function scoreMatch(title, query) {
  if (!title) return 0;
  const t = title.toLowerCase();
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (!words.length) return 0;
  return words.filter((w) => t.includes(w)).length / words.length;
}

// NexRay "ytplay": query → video + ready-to-use audio link in one call
async function searchNexrayPlay(query) {
  const { data } = await api.get(`https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(query)}`, {
    timeout: 2500,
  });
  const r = data?.result;
  if (!data?.status || !r) return null;
  return {
    url: r.url || (r.id ? `https://youtube.com/watch?v=${r.id}` : ""),
    title: r.title || query,
    thumbnail: r.thumbnail || "",
    duration: r.duration || r.seconds || "",
    author: r.channel || "",
    views: r.views || "",
    directAudioUrl:
      typeof r.download_url === "string" && r.download_url.startsWith("http") ? r.download_url : "",
  };
}

async function searchPlayDl(query) {
  const playdl = (await import("play-dl")).default;
  const res = await playdl.search(query, { source: { youtube: "video" }, limit: 5 });
  if (!res?.length) return null;
  const best = res
    .map((r) => ({ r, score: scoreMatch(r.title, query) }))
    .sort((a, b) => b.score - a.score)[0].r;
  const sec = best.durationInSec || 0;
  return {
    url: best.url,
    title: best.title || query,
    thumbnail: best.thumbnails?.[0]?.url || "",
    duration: sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "",
    author: best.channel?.name || "",
    views: best.views ?? "",
  };
}

async function searchYT(query) {
  const key = query.toLowerCase().trim();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.ts < SEARCH_TTL) return hit.v;

  const v = await firstSuccess([
    withTimeout(searchNexrayPlay(query), 2800),
    withTimeout(searchPlayDl(query), 3000),
  ]);
  if (v) {
    if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
    searchCache.set(key, { v, ts: Date.now() });
  }
  return v;
}

async function oEmbedInfo(ytUrl) {
  try {
    const { data } = await api.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`, {
      timeout: 4000,
    });
    return {
      title: data?.title || "",
      author: data?.author_name || "",
      thumbnail: data?.thumbnail_url || "",
    };
  } catch {
    return null;
  }
}

// Direct link: oEmbed (fast, reliable) + search (adds duration/views) in parallel.
// The card is NOT held back for the slower search: after oEmbed lands we give
// the search a short grace window only.
async function getMetaForUrl(ytUrl, id) {
  const oP = withTimeout(oEmbedInfo(ytUrl), 2500);
  const sP = withTimeout(searchYT(ytUrl), 3000);
  const o = await oP;
  const f = await Promise.race([sP, sleep(o?.title ? 1200 : 3000).then(() => null)]);

  return {
    title: o?.title || f?.title || "",
    author: o?.author || f?.author || "",
    thumbnail: o?.thumbnail || f?.thumbnail || thumbUrl(id),
    duration: f?.duration || "",
    views: f?.views || "",
  };
}

// ── Info card ────────────────────────────────────────────────────────────────
async function sendInfoCard(sock, jid, msg, meta, botName, type) {
  const label = type === "video" ? "🎬 VIDEO" : "🎵 AUDIO";
  const caption =
    `✦✦✦✦✦✦✦✦✦✦\n${label} • ${botName}\n✦✦✦✦✦✦✦✦✦✦\n\n` +
    `📌 *${meta.title || "Unknown"}*\n` +
    `👤 Channel : ${meta.author || "N/A"}\n` +
    `⏱ Duration : ${formatDuration(meta.duration)}\n` +
    `👁 Views    : ${formatViews(meta.views)}\n\n` +
    `⏳ _Downloading, please wait..._`;

  try {
    if (meta.thumbnail) {
      await sock.sendMessage(jid, { image: { url: meta.thumbnail }, caption }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: caption }, { quoted: msg });
    }
  } catch {
    try {
      await sock.sendMessage(jid, { text: caption }, { quoted: msg });
    } catch {}
  }
}

function mediaCaption(meta, botName, type) {
  const label = type === "video" ? "🎬 VIDEO" : "🎵 MUSIC";
  return (
    `✦✦✦✦✦✦✦✦✦✦\n${label} • ${botName}\n✦✦✦✦✦✦✦✦✦✦\n\n` +
    `🎙 *${meta.title || "Unknown"}*\n` +
    `🎤 ${meta.author || "Unknown"}\n` +
    `⏱ ${formatDuration(meta.duration)}\n\n` +
    `> 🤖 Powered by ${botName} | Dev: Ahsan Ali Wadani`
  );
}

// ── Plugin ───────────────────────────────────────────────────────────────────
export default {
  command: "play",
  alias: ["song", "yt", "ytmp3", "mp3", "ytmp4", "video", "mp4"],
  description: "Download YouTube audio or video",
  category: "download",

  execute: async ({ sock, msg, jid, text, command, react, reply, sendMedia, prefix, config }) => {
    const botName = config?.botName || "AA MD Bot";
    const safeReact = (e) => Promise.resolve().then(() => react(e)).catch(() => {});
    let query = text?.trim();

    if (!query) {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (q) query = (q.conversation || q.extendedTextMessage?.text || "").trim();
    }

    if (!query) {
      return reply(
        `🎬 *YouTube Downloader*\n\n` +
          `📌 *Usage:*\n` +
          `• *${prefix}play* <song name or YT link> — audio\n` +
          `• *${prefix}video* <name or YT link> — video\n` +
          `• *${prefix}mp3* <YT link> — direct audio\n` +
          `• *${prefix}mp4* <YT link> — direct video\n\n` +
          `💡 Replying to a message containing a YT link also works`,
      );
    }

    const isVideoCmd = command === "mp4" || command === "ytmp4" || command === "video";
    const isDirectOnly = command === "mp3" || command === "ytmp3" || command === "mp4" || command === "ytmp4";
    const type = isVideoCmd ? "video" : "audio";

    let job = null;
    try {
      safeReact(isVideoCmd ? "🎥" : "🎶"); // fire-and-forget, never blocks the pipeline

      const directUrl = extractUrl(query);
      const directId = extractVideoId(directUrl);

      if (isDirectOnly && !directUrl) {
        safeReact("❌");
        return reply(
          `❌ *Please provide a valid YouTube link.*\n\n` +
            `To search by name instead, use:\n` +
            `• *${prefix}play* <song name>\n` +
            `• *${prefix}video* <video name>`,
        );
      }

      // 1) Resolve URL. Direct link → zero waiting, download starts right now.
      let ytUrl, id, metaPromise, directAudioUrl = "";

      if (directId) {
        id = directId;
        ytUrl = watchUrl(id);
        metaPromise = getMetaForUrl(ytUrl, id);
      } else {
        const found = await searchYT(query).catch(() => null);
        if (!found?.url) {
          safeReact("❌");
          return reply(
            `❌ *No results found for: "${query}"*\n\n` +
              `💡 Try a different name or a YouTube link:\n` +
              `• *${prefix}${isVideoCmd ? "video" : "play"}* Shape of You\n` +
              `• *${prefix}${isVideoCmd ? "video" : "play"}* https://youtu.be/...`,
          );
        }
        id = extractVideoId(found.url);
        ytUrl = id ? watchUrl(id) : found.url;
        directAudioUrl = found.directAudioUrl || "";
        metaPromise = Promise.resolve({
          ...found,
          thumbnail: found.thumbnail || (id ? thumbUrl(id) : ""),
        });
      }

      // 2) START DOWNLOAD NOW (parallel with metadata + info card)
      const key = `${id || ytUrl}:${type}`;
      job = startMedia(key, ytUrl, type, directAudioUrl);

      // 3) Metadata → duration guard → info card (runs while download is in progress)
      const meta = await metaPromise;

      const secs = parseDuration(meta.duration);
      const maxSecs = (isVideoCmd ? MAX_VIDEO_MIN : MAX_AUDIO_MIN) * 60;
      if (secs && secs > maxSecs) {
        job.release();
        job = null;
        safeReact("❌");
        return reply(
          `❌ *Too long!*\n\n` +
            `This ${type} is ${formatDuration(meta.duration)} long. ` +
            `Maximum allowed: ${isVideoCmd ? MAX_VIDEO_MIN : MAX_AUDIO_MIN} minutes.`,
        );
      }

      const cardPromise = sendInfoCard(sock, jid, msg, meta, botName, type);

      // 4) Wait for media (+ make sure the card went out first, for ordering)
      const result = await job.promise;
      await cardPromise;

      if (!result) {
        safeReact("❌");
        return reply(
          `❌ *${isVideoCmd ? "Video" : "Audio"} download failed*\n\n` +
            `All provider links were unreachable or expired. Please try again or use a different ${isVideoCmd ? "video" : "song"}.`,
        );
      }

      meta.title = meta.title || result.meta?.title || "";

      // 5) Send plain media (no ad-card / contextInfo / link)
      if (isVideoCmd) {
        const asDoc = result.buf.length > DOC_THRESHOLD;
        const fileName = safeFileName(meta.title, "mp4");
        await sock.sendMessage(
          jid,
          asDoc
            ? { document: result.buf, mimetype: "video/mp4", fileName, caption: mediaCaption(meta, botName, "video") }
            : { video: result.buf, mimetype: "video/mp4", fileName, caption: mediaCaption(meta, botName, "video") },
          { quoted: msg },
        );
      } else {
        const { mime, ext } = audioMime(result.contentType);
        await sendMedia({
          audio: result.buf,
          mimetype: mime,
          fileName: safeFileName(meta.title, ext),
          ptt: false,
        });
      }

      safeReact("✅");
    } catch (err) {
      console.error("[ YouTube ]", err.message);
      safeReact("❌");
      reply(
        `❌ *YouTube download failed.*\n\n` +
          `Please try again or use a different YouTube link.\n` +
          `💡 You can also try: *${prefix}play* <song name>`,
      ).catch(() => {});
    } finally {
      job?.release();
    }
  },
};
