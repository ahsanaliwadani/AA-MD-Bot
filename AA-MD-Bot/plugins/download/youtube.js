// ============================================
// AA MD Bot - YouTube Downloader (v3 - FAST)
// Developer: Ahsan Ali Wadani
// Flow: command → INSTANT info card (thumbnail+title+channel+duration+views)
//       → races ALL provider links in parallel, first that actually downloads wins
//       → sends plain audio/video (no ad-card / no attached link)
// ============================================

import axios from "axios";

const YT_REGEX =
  /(https?:\/\/(?:(?:www|m|music)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]+\S*)/i;

const extractUrl = (t) => {
  if (!t) return null;
  const m = t.match(YT_REGEX);
  return m ? m[1] : null;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function timeoutFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1000 ? value : fallback;
}

// Provider links can take several seconds to prepare on a first request.
// Keep the metadata card fast, but give media providers enough time to finish.
const YT_PROVIDER_TIMEOUT_MS = timeoutFromEnv("YT_PROVIDER_TIMEOUT_MS", 30000);
const YT_AUDIO_DOWNLOAD_TIMEOUT_MS = timeoutFromEnv("YT_AUDIO_DOWNLOAD_TIMEOUT_MS", 90000);
const YT_VIDEO_DOWNLOAD_TIMEOUT_MS = timeoutFromEnv("YT_VIDEO_DOWNLOAD_TIMEOUT_MS", 120000);

// ── Deep-scan fallback: search an arbitrary API response for a field whose KEY
// name matches a pattern (title/channel/duration/views/thumbnail), regardless
// of the exact schema. Used only when the direct known field names don't hit.
function deepFind(obj, regex, depth = 0, seen = new Set()) {
  if (!obj || typeof obj !== "object" || depth > 4 || seen.has(obj))
    return undefined;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (regex.test(k)) {
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return v;
      if (v && typeof v === "object") {
        if (typeof v.url === "string") return v.url;
        if (typeof v.name === "string") return v.name;
        if (typeof v.timestamp === "string") return v.timestamp;
        if (typeof v.text === "string") return v.text;
      }
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepFind(v, regex, depth + 1, seen);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// ── Race helper: run all promises in parallel, return the FIRST truthy result.
// Faster than sequential try-one-then-next-then-next.

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

// ── Buffer downloader with two header strategies (some CDNs want a browser
// UA, some block anything that looks like a browser — so we try both) ────────
async function tryDownload(url, timeout, signal) {
  const attempts = [
    {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.youtube.com/",
        Accept: "*/*",
      },
    },
    { headers: {} }, // plain, no spoofed headers
  ];

  for (const cfg of attempts) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout,
        maxRedirects: 10,
        maxContentLength: 300 * 1024 * 1024,
        validateStatus: (s) => s >= 200 && s < 300,
        signal,
        ...cfg,
      });
      const ct = String(res.headers?.["content-type"] || "").toLowerCase();
      // Reject if the server actually returned an HTML/JSON error page instead of media
      if (ct.includes("text/html") || ct.includes("application/json")) continue;
      const buf = Buffer.from(res.data);
      if (buf.length > 0) return buf;
    } catch (e) {
      if (e.code === "ERR_CANCELED" || signal?.aborted) return null;
      console.error(
        "[YT download attempt failed]",
        url,
        "-",
        e.response?.status || e.message,
      );
    }
  }
  return null;
}

// ── Race ALL candidates in parallel — first valid buffer wins (huge speed win
// over trying them one at a time) ─────────────────────────────────────────────
async function downloadFirstWorking(createCandidateRequests, timeout, minSize) {
  // Start provider-link requests and media downloads as one streaming race.
  // A quick provider no longer waits for slow providers to return their links.
  const controller = new AbortController();
  return new Promise((resolve) => {
    const requests = createCandidateRequests(controller.signal);
    let pendingProviders = requests.length;
    let activeDownloads = 0;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(result);
    };

    const finishIfExhausted = () => {
      if (pendingProviders === 0 && activeDownloads === 0) finish(null);
    };

    for (const request of requests) {
      Promise.resolve(request)
        .then((candidate) => {
          if (!candidate?.url || settled) return;
          activeDownloads += 1;
          return tryDownload(candidate.url, timeout, controller.signal)
            .then((buf) => {
              if (buf && buf.length >= minSize) finish({ buf, meta: candidate });
            })
            .catch(() => {})
            .finally(() => {
              activeDownloads -= 1;
              finishIfExhausted();
            });
        })
        .catch(() => {})
        .finally(() => {
          pendingProviders -= 1;
          finishIfExhausted();
        });
    }
  });
}

// ── Format helpers ─────────────────────────────────────────────────────────────
// NOTE: this is the ONLY place a views value gets its final "K/M/B views"
// text form. Every source (play-dl, NexRay, etc.) must hand
// this function a RAW number (or a plain numeric string) — never a value
// that's already been abbreviated — otherwise the K/M/B suffix gets
// stripped when this function tries to parse it back into a number and the
// display silently degrades to a bare number.
function formatViews(v) {
  if (v === undefined || v === null || v === "") return "N/A";

  // Defensive: if something upstream already produced an abbreviated string
  // like "1.2M" or "1.2M views" (e.g. nexray's ytplay endpoint), don't
  // mangle it — just normalize it.
  if (typeof v === "string") {
    const already = v.trim().match(/^([\d,.]+)\s*([kKmMbB])\b/);
    if (already) {
      return `${already[1]}${already[2].toUpperCase()} views`;
    }
  }

  let n = v;
  if (typeof n === "string") n = Number(n.toString().replace(/[^0-9.]/g, ""));
  if (!n || isNaN(n)) return typeof v === "string" && v.trim() ? v : "N/A";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B views";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M views";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K views";
  return n + " views";
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

// ── Score how well a result title matches the query words (used to pick the
// best of play-dl's top-5 results instead of blindly trusting result #1) ────
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

// ── NEW: Nexray "ytplay" search — used primarily for the .play command.
// Resolves a plain-text query directly to a video + (bonus) a ready-to-use
// audio download_url, saving a whole extra download-API round trip when it
// succeeds. If it fails we just fall through to the older search sources
// below, nothing else changes. ────────────────────────────────────────────
async function searchNexrayPlay(query) {
  const { data } = await axios.get(
    `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(query)}`,
    { timeout: 2500 },
  );
  const r = data?.result;
  if (!data?.status || !r) return null;
  return {
    url: r.url || (r.id ? `https://youtube.com/watch?v=${r.id}` : ""),
    title: r.title || query,
    thumbnail: r.thumbnail || "",
    duration: r.duration || r.seconds || "",
    author: r.channel || "",
    // raw/abbreviated string from nexray (e.g. "57.6M") — formatViews()
    // already knows how to normalize this without mangling it.
    views: r.views || "",
    // Bonus: nexray's ytplay response ships a ready-to-stream audio link.
    // getAudioCandidates() will use this as a free extra candidate instead
    // of making another API call, when available.
    directAudioUrl:
      typeof r.download_url === "string" && r.download_url.startsWith("http")
        ? r.download_url
        : "",
  };
}

// ── Search (Nexray ytplay primary → play-dl fallback) ─────────────────────
async function searchPlayDl(query) {
  const playdl = (await import("play-dl")).default;
  const res = await playdl.search(query, { source: { youtube: "video" }, limit: 5 });
  if (!res?.length) return null;
  const scored = res.map((r) => ({ r, score: scoreMatch(r.title, query) }));
  scored.sort((a, b) => b.score - a.score);
  const r = scored[0].r;
  const m = Math.floor((r.durationInSec || 0) / 60);
  const s = String((r.durationInSec || 0) % 60).padStart(2, "0");
  return {
    url: r.url,
    title: r.title || query,
    thumbnail: r.thumbnails?.[0]?.url || "",
    duration: r.durationInSec ? `${m}:${s}` : "",
    author: r.channel?.name || "",
    views: r.views ?? "",
  };
}

async function searchYT(query) {
  // Race independent search sources so the info card is not blocked by one
  // slow provider. This keeps thumbnail/title/details in the 2-3 second path.
  return firstSuccess([
    withTimeout(searchNexrayPlay(query), 2800),
    withTimeout(searchPlayDl(query), 3000),
  ]);
}

// ── YouTube oEmbed fallback (used for direct links). Free, official, no key. ──
async function oEmbedInfo(ytUrl) {
  try {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`,
      { timeout: 8000 },
    );
    return {
      title: data?.title || "",
      author: data?.author_name || "",
      thumbnail: data?.thumbnail_url || "",
      duration: "",
      views: "",
    };
  } catch {
    return null;
  }
}

// ── Resolve query → { ytUrl, meta } (search-by-name OR direct link) ───────────
// oEmbed + search now run IN PARALLEL for direct links instead of sequentially.
async function resolveMeta(query) {
  const directUrl = extractUrl(query);

  if (directUrl) {
    // Keep the info card on the fast path even if YouTube's oEmbed endpoint
    // is slow. Search providers still fill in any missing details.
    const [oEmbedResult, found] = await Promise.all([
      withTimeout(oEmbedInfo(directUrl), 2800),
      withTimeout(searchYT(query), 3200),
    ]);

    let meta = oEmbedResult || {};
    if (found) {
      meta.title = meta.title || found.title;
      meta.author = meta.author || found.author;
      meta.thumbnail = meta.thumbnail || found.thumbnail;
      meta.duration = meta.duration || found.duration;
      meta.views = meta.views || found.views;
      meta.directAudioUrl = meta.directAudioUrl || found.directAudioUrl || "";
    }
    if (!meta.title && !meta.author && !meta.thumbnail) {
      meta = {
        title: query,
        author: "",
        duration: "",
        views: "",
        thumbnail: "",
        directAudioUrl: "",
      };
    }
    return { ytUrl: directUrl, meta };
  }

  let found;
  try {
    found = await searchYT(query);
  } catch {}
  if (!found?.url) return { ytUrl: null, meta: null };
  return { ytUrl: found.url, meta: found };
}

// ── Audio provider candidates (all fetched IN PARALLEL) ───────────────────────
function getAudioCandidates(ytUrl, meta, signal) {
  const enc = encodeURIComponent(ytUrl);

  // NEW: free fast-path candidate — reuse the direct audio link nexray's
  // ytplay search already handed us, no extra API call needed.
  const pDirect =
    meta?.directAudioUrl
      ? Promise.resolve({
          url: meta.directAudioUrl,
          title: meta.title || "",
          filename: "audio.mp3",
        })
      : Promise.resolve(null);

  // NEW: nexray v1/ytmp3 — extra dedicated audio download API.
  const pNexrayV1 = axios
    .get(`https://api.nexray.eu.cc/downloader/v1/ytmp3?url=${enc}`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http"))
        return {
          url,
          title: r?.title || d?.title || "",
          filename: "audio.mp3",
        };
      return null;
    })
    .catch(() => null);

  const p2 = axios
    .get(`https://api-abztech.zone.id/download/ytdlv3?url=${enc}`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const url = d?.downloadUrl || d?.download_url || d?.url || d?.result?.url;
      if (
        d?.status !== false &&
        typeof url === "string" &&
        url.startsWith("http")
      )
        return {
          url,
          title: d?.title || "",
          filename: d?.filename || "audio.mp3",
        };
      return null;
    })
    .catch(() => null);

  const p3 = axios
    .get(`https://eliteprotech-apis.zone.id/ytdown?url=${enc}&format=mp3`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const url =
        d?.downloadURL ||
        d?.download_url ||
        d?.url ||
        d?.result?.url ||
        d?.result?.download_url;
      if (typeof url === "string" && url.startsWith("http"))
        return {
          url,
          title: d?.title || "",
          filename: d?.filename || "audio.mp3",
        };
      return null;
    })
    .catch(() => null);

  return [pDirect, pNexrayV1, p2, p3];
}

// ── Video provider candidates (all fetched IN PARALLEL) ───────────────────────
function getVideoCandidates(ytUrl, signal) {
  const enc = encodeURIComponent(ytUrl);

  // NEW: nexray v1/ytmp4 — extra dedicated video download API (1080p).
  const pNexrayV1 = axios
    .get(`https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${enc}&resolusi=1080`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http"))
        return {
          url,
          title: r?.title || d?.title || "",
          filename: "video.mp4",
        };
      return null;
    })
    .catch(() => null);

  const pElite = axios
    .get(`https://eliteprotech-apis.zone.id/ytdown?url=${enc}&format=mp4`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const url =
        d?.downloadURL ||
        d?.download_url ||
        d?.url ||
        d?.result?.url ||
        d?.result?.download_url;
      if (typeof url === "string" && url.startsWith("http"))
        return {
          url,
          title: d?.title || "",
          filename: d?.filename || "video.mp4",
        };
      return null;
    })
    .catch(() => null);

  const pAbz = axios
    .get(`https://api-abztech.zone.id/download/ytdl4?url=${enc}`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const url = d?.downloadUrl || d?.download_url || d?.url || d?.result?.url;
      if (
        d?.status !== false &&
        typeof url === "string" &&
        url.startsWith("http")
      )
        return {
          url,
          title: d?.title || "",
          filename: d?.filename || "video.mp4",
        };
      return null;
    })
    .catch(() => null);

  return [pNexrayV1, pElite, pAbz];
}

// ── Quick INFO CARD (sent within 1-2 sec, before any download starts) ─────────
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
      await sock.sendMessage(
        jid,
        { image: { url: meta.thumbnail }, caption },
        { quoted: msg },
      );
    } else {
      await sock.sendMessage(jid, { text: caption }, { quoted: msg });
    }
  } catch {
    try {
      await sock.sendMessage(jid, { text: caption }, { quoted: msg });
    } catch {}
  }
}

// ── Final media caption (plain text, NO contextInfo / NO ad-card / NO link) ──
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

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: "play",
  alias: ["song", "yt", "ytmp3", "mp3", "ytmp4", "video", "mp4"],
  description: "Download YouTube audio or video",
  category: "download",

  execute: async ({
    sock,
    msg,
    jid,
    text,
    command,
    react,
    reply,
    sendMedia,
    prefix,
    config,
  }) => {
    const botName = config?.botName || "AA MD Bot";
    let query = text?.trim();

    if (!query) {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (q)
        query = (q.conversation || q.extendedTextMessage?.text || "").trim();
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

    const isVideoCmd =
      command === "mp4" || command === "ytmp4" || command === "video";
    const isDirectOnly =
      command === "mp3" ||
      command === "ytmp3" ||
      command === "mp4" ||
      command === "ytmp4";

    try {
      await react(isVideoCmd ? "🎥" : "🎶");

      if (isDirectOnly && !extractUrl(query)) {
        await react("❌");
        return reply(
          `❌ *Please provide a valid YouTube link.*\n\n` +
            `To search by name instead, use:\n` +
            `• *${prefix}play* <song name>\n` +
            `• *${prefix}video* <video name>`,
        );
      }

      // 1) Resolve URL + metadata
      const { ytUrl, meta } = await resolveMeta(query);
      if (!ytUrl) {
        await react("❌");
        return reply(
          `❌ *No results found for: "${query}"*\n\n` +
            `💡 Try a different name or a YouTube link:\n` +
            `• *${prefix}${isVideoCmd ? "video" : "play"}* Shape of You\n` +
            `• *${prefix}${isVideoCmd ? "video" : "play"}* https://youtu.be/...`,
        );
      }

      // 2) INSTANT info card
      await sendInfoCard(
        sock,
        jid,
        msg,
        meta,
        botName,
        isVideoCmd ? "video" : "audio",
      );

      // 3) Fetch every provider link in parallel and begin each download the
      // instant its link arrives. The first valid media response wins.
      const timeout = isVideoCmd
        ? YT_VIDEO_DOWNLOAD_TIMEOUT_MS
        : YT_AUDIO_DOWNLOAD_TIMEOUT_MS;
      const minSize = isVideoCmd ? 50000 : 10000;
      // Audio starts with NexRay only; other providers are used only when its
      // request or media download fails, keeping NexRay the real primary source.
      let result;
      if (!isVideoCmd) {
        result = await downloadFirstWorking(
          (signal) => getAudioCandidates(ytUrl, meta, signal).slice(0, 2),
          timeout,
          minSize,
        );
        if (!result) {
          result = await downloadFirstWorking(
            (signal) => getAudioCandidates(ytUrl, meta, signal).slice(2),
            timeout,
            minSize,
          );
        }
      } else {
        result = await downloadFirstWorking(
          (signal) => getVideoCandidates(ytUrl, signal),
          timeout,
          minSize,
        );
      }

      if (!result) {
        await react("❌");
        return reply(
          `❌ *${isVideoCmd ? "Video" : "Audio"} download failed*\n\n` +
            `All provider links were unreachable or expired. Please try again or use a different ${isVideoCmd ? "video" : "song"}.`,
        );
      }

      if (result.meta.title) meta.title = meta.title || result.meta.title;

      // 4) Send the actual media — plain, no ad-card, no contextInfo, no link
      if (isVideoCmd) {
        await sock.sendMessage(
          jid,
          {
            video: result.buf,
            mimetype: "video/mp4",
            fileName: result.meta.filename || `${meta.title || "video"}.mp4`,
            caption: mediaCaption(meta, botName, "video"),
          },
          { quoted: msg },
        );
      } else {
        await sendMedia({
          audio: result.buf,
          mimetype: "audio/mpeg",
          fileName: result.meta.filename || "audio.mp3",
          ptt: false,
        });
      }

      await react("✅");
    } catch (err) {
      console.error("[ YouTube ]", err.message);
      await react("❌").catch(() => {});
      reply(
        `❌ *YouTube download failed.*\n\n` +
          `Please try again or use a different YouTube link.\n` +
          `💡 You can also try: *${prefix}play* <song name>`,
      ).catch(() => {});
    }
  },
};
