// ============================================
// AA MD Bot - YouTube Downloader (v4 - TURBO)
// Developer: Ahsan Ali Wadani
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

const YT_PROVIDER_TIMEOUT_MS = timeoutFromEnv("YT_PROVIDER_TIMEOUT_MS", 12000);
const YT_AUDIO_DOWNLOAD_TIMEOUT_MS = timeoutFromEnv("YT_AUDIO_DOWNLOAD_TIMEOUT_MS", 45000);
const YT_VIDEO_DOWNLOAD_TIMEOUT_MS = timeoutFromEnv("YT_VIDEO_DOWNLOAD_TIMEOUT_MS", 75000);

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
    let done = false;
    for (const p of promises) {
      Promise.resolve(p)
        .then((v) => {
          if (v && !done) {
            done = true;
            resolve(v);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (--pending === 0 && !done) resolve(null);
        });
    }
  });
}

async function tryDownload(url, timeout, signal) {
  const attempts = [
    { headers: { "User-Agent": UA, Accept: "*/*" } },
    { headers: {} },
  ];

  for (const cfg of attempts) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout,
        maxRedirects: 8,
        maxContentLength: 150 * 1024 * 1024,
        validateStatus: (s) => s >= 200 && s < 300,
        signal,
        ...cfg,
      });
      const ct = String(res.headers?.["content-type"] || "").toLowerCase();
      if (ct.includes("text/html") || ct.includes("application/json")) continue;
      const buf = Buffer.from(res.data);
      if (buf.length > 0) return buf;
    } catch (e) {
      if (e.code === "ERR_CANCELED" || signal?.aborted) return null;
    }
  }
  return null;
}

async function downloadFirstWorking(createCandidateRequests, timeout, minSize) {
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

function formatViews(v) {
  if (v === undefined || v === null || v === "") return "N/A";
  if (typeof v === "string") {
    const already = v.trim().match(/^([\d,.]+)\s*([kKmMbB])\b/);
    if (already) return `${already[1]}${already[2].toUpperCase()} views`;
  }
  let n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : v;
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

function scoreMatch(title, query) {
  if (!title) return 0;
  const t = title.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return 0;
  return words.filter((w) => t.includes(w)).length / words.length;
}

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
    views: r.views || "",
    directAudioUrl:
      typeof r.download_url === "string" && r.download_url.startsWith("http")
        ? r.download_url
        : "",
  };
}

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
  return firstSuccess([
    withTimeout(searchNexrayPlay(query), 2500),
    withTimeout(searchPlayDl(query), 2800),
  ]);
}

async function oEmbedInfo(ytUrl) {
  try {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`,
      { timeout: 2500 },
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

async function resolveMeta(query) {
  const directUrl = extractUrl(query);

  if (directUrl) {
    const [oEmbedResult, found] = await Promise.all([
      withTimeout(oEmbedInfo(directUrl), 2500),
      withTimeout(searchYT(query), 2800),
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
      meta = { title: query, author: "", duration: "", views: "", thumbnail: "", directAudioUrl: "" };
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

function getAudioCandidates(ytUrl, meta, signal) {
  const enc = encodeURIComponent(ytUrl);

  const pDirect = meta?.directAudioUrl
    ? Promise.resolve({ url: meta.directAudioUrl, title: meta.title || "", filename: "audio.mp3" })
    : Promise.resolve(null);

  const pNexrayV1 = axios
    .get(`https://api.nexray.eu.cc/downloader/v1/ytmp3?url=${enc}`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http"))
        return { url, title: r?.title || d?.title || "", filename: "audio.mp3" };
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
      if (d?.status !== false && typeof url === "string" && url.startsWith("http"))
        return { url, title: d?.title || "", filename: d?.filename || "audio.mp3" };
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
        d?.downloadURL || d?.download_url || d?.url || d?.result?.url || d?.result?.download_url;
      if (typeof url === "string" && url.startsWith("http"))
        return { url, title: d?.title || "", filename: d?.filename || "audio.mp3" };
      return null;
    })
    .catch(() => null);

  return [pDirect, pNexrayV1, p2, p3];
}

function getVideoCandidates(ytUrl, signal) {
  const enc = encodeURIComponent(ytUrl);

  const pNexrayV1 = axios
    .get(`https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${enc}&resolusi=720`, {
      timeout: YT_PROVIDER_TIMEOUT_MS,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http"))
        return { url, title: r?.title || d?.title || "", filename: "video.mp4" };
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
        d?.downloadURL || d?.download_url || d?.url || d?.result?.url || d?.result?.download_url;
      if (typeof url === "string" && url.startsWith("http"))
        return { url, title: d?.title || "", filename: d?.filename || "video.mp4" };
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
      if (d?.status !== false && typeof url === "string" && url.startsWith("http"))
        return { url, title: d?.title || "", filename: d?.filename || "video.mp4" };
      return null;
    })
    .catch(() => null);

  return [pNexrayV1, pElite, pAbz];
}

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
    const isDirectOnly =
      command === "mp3" || command === "ytmp3" || command === "mp4" || command === "ytmp4";

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

      const timeout = isVideoCmd ? YT_VIDEO_DOWNLOAD_TIMEOUT_MS : YT_AUDIO_DOWNLOAD_TIMEOUT_MS;
      const minSize = isVideoCmd ? 50000 : 10000;

      const [, result] = await Promise.all([
        sendInfoCard(sock, jid, msg, meta, botName, isVideoCmd ? "video" : "audio"),
        downloadFirstWorking(
          (signal) =>
            isVideoCmd ? getVideoCandidates(ytUrl, signal) : getAudioCandidates(ytUrl, meta, signal),
          timeout,
          minSize,
        ),
      ]);

      if (!result) {
        await react("❌");
        return reply(
          `❌ *${isVideoCmd ? "Video" : "Audio"} download failed*\n\n` +
            `All provider links were unreachable or expired. Please try again or use a different ${isVideoCmd ? "video" : "song"}.`,
        );
      }

      if (result.meta.title) meta.title = meta.title || result.meta.title;

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
