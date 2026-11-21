// ============================================
// AA MD Bot - YouTube Downloader (v6 - NEXRAY AUDIO + ABZTECH 720P VIDEO)
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

const API_TIMEOUT = 35000;
const DL_TIMEOUT = 90000;

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

// ── Download binary buffer with retry ───────────────────────────────────────
async function downloadBuffer(url, signal, minSize = 10000) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) return null;
  const headerSets = [
    { "User-Agent": UA, Accept: "*/*" },
    {},
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const headers of headerSets) {
      if (signal?.aborted) return null;
      try {
        const res = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: DL_TIMEOUT,
          maxRedirects: 10,
          maxContentLength: 200 * 1024 * 1024,
          validateStatus: (s) => s >= 200 && s < 300,
          headers,
          signal,
        });
        const ct = String(res.headers?.["content-type"] || "").toLowerCase();
        if (ct.includes("text/html") || ct.includes("application/json")) continue;
        const buf = Buffer.from(res.data);
        if (buf.length >= minSize) return buf;
      } catch (e) {
        if (e.code === "ERR_CANCELED" || signal?.aborted) return null;
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

// ── Parallel race across candidate links ────────────────────────────────────
async function raceDownloads(tasks, minSize) {
  const controller = new AbortController();
  return new Promise((resolve) => {
    const promises = tasks(controller.signal);
    let pending = promises.length;
    if (!pending) return resolve(null);
    let settled = false;

    const finish = (res) => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(res);
    };

    for (const p of promises) {
      Promise.resolve(p)
        .then(async (item) => {
          if (!item?.url || settled) return;
          const buf = await downloadBuffer(item.url, controller.signal, minSize);
          if (buf && !settled) finish({ buf, meta: item });
        })
        .catch(() => {})
        .finally(() => {
          if (--pending === 0 && !settled) finish(null);
        });
    }
  });
}

// ── NexRay ytplay (instant metadata + direct audio link) ────────────────────
async function nexrayYtPlay(query) {
  const { data } = await axios.get(
    `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(query)}`,
    { timeout: API_TIMEOUT },
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

// ── Audio Tasks (Pure NexRay) ───────────────────────────────────────────────
function getAudioTasks(ytUrl, meta, signal) {
  const enc = encodeURIComponent(ytUrl);

  const tDirect = meta?.directAudioUrl
    ? Promise.resolve({
        url: meta.directAudioUrl,
        title: meta.title || "",
        filename: `${meta.title || "audio"}.mp3`,
      })
    : Promise.resolve(null);

  const tV1Mp3 = axios
    .get(`https://api.nexray.eu.cc/downloader/v1/ytmp3?url=${enc}`, {
      timeout: API_TIMEOUT,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http")) {
        return { url, title: r?.title || meta?.title || "", filename: "audio.mp3" };
      }
      return null;
    })
    .catch(() => null);

  const tMp3 = axios
    .get(`https://api.nexray.eu.cc/downloader/ytmp3?url=${enc}`, {
      timeout: API_TIMEOUT,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http")) {
        return { url, title: r?.title || meta?.title || "", filename: "audio.mp3" };
      }
      return null;
    })
    .catch(() => null);

  return [tDirect, tV1Mp3, tMp3];
}

// ── Video Tasks (AbzTech Mistral 720p Primary + NexRay Fallback) ────────────
function getVideoTasks(ytUrl, meta, signal) {
  const enc = encodeURIComponent(ytUrl);

  const tAbzMistral = axios
    .get(`https://api-abztech.apps.mistral.run/download/ytdl?url=${enc}`, {
      timeout: API_TIMEOUT,
      signal,
    })
    .then(({ data: d }) => {
      const url =
        d?.downloadUrl ||
        d?.url ||
        (Array.isArray(d?.video) && d.video[0]?.url) ||
        d?.result?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http")) {
        return {
          url,
          title: d?.title || meta?.title || "",
          duration: d?.duration || meta?.duration || "",
          thumbnail: d?.thumbnail || meta?.thumbnail || "",
          filename: `${d?.title || meta?.title || "video"}.mp4`,
        };
      }
      return null;
    })
    .catch(() => null);

  const tNexrayV1 = axios
    .get(`https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${enc}&resolusi=720`, {
      timeout: API_TIMEOUT,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http")) {
        return { url, title: r?.title || meta?.title || "", filename: "video.mp4" };
      }
      return null;
    })
    .catch(() => null);

  const tNexrayMp4 = axios
    .get(`https://api.nexray.eu.cc/downloader/ytmp4?url=${enc}`, {
      timeout: API_TIMEOUT,
      signal,
    })
    .then(({ data: d }) => {
      const r = d?.result || d;
      const url = r?.url || r?.download_url || r?.downloadUrl || d?.url;
      if (d?.status !== false && typeof url === "string" && url.startsWith("http")) {
        return { url, title: r?.title || meta?.title || "", filename: "video.mp4" };
      }
      return null;
    })
    .catch(() => null);

  return [tAbzMistral, tNexrayV1, tNexrayMp4];
}

// ── Quick INFO CARD ─────────────────────────────────────────────────────────
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
    await sock.sendMessage(jid, { text: caption }, { quoted: msg }).catch(() => {});
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
          `• *${prefix}mp4* <YT link> — direct video`,
      );
    }

    const isVideoCmd = command === "mp4" || command === "ytmp4" || command === "video";
    const isDirectOnly =
      command === "mp3" || command === "ytmp3" || command === "mp4" || command === "ytmp4";

    try {
      await react(isVideoCmd ? "🎥" : "🎶");

      const directUrl = extractUrl(query);
      if (isDirectOnly && !directUrl) {
        await react("❌");
        return reply(
          `❌ *Please provide a valid YouTube link.*\n\n` +
            `To search by name instead, use:\n` +
            `• *${prefix}play* <song name>\n` +
            `• *${prefix}video* <video name>`,
        );
      }

      // 1) Resolve metadata + URL via NexRay ytplay
      let ytUrl = directUrl;
      let meta = await nexrayYtPlay(query).catch(() => null);

      if (meta?.url && !ytUrl) ytUrl = meta.url;
      if (!meta) {
        meta = { title: query, author: "N/A", duration: "", views: "", thumbnail: "", directAudioUrl: "" };
      }

      if (!ytUrl) {
        await react("❌");
        return reply(`❌ *No results found for: "${query}"*`);
      }

      const minSize = isVideoCmd ? 40000 : 8000;

      // 2) Send Info Card & Race Downloads in PARALLEL
      const [, result] = await Promise.all([
        sendInfoCard(sock, jid, msg, meta, botName, isVideoCmd ? "video" : "audio"),
        raceDownloads(
          (signal) =>
            isVideoCmd
              ? getVideoTasks(ytUrl, meta, signal)
              : getAudioTasks(ytUrl, meta, signal),
          minSize,
        ),
      ]);

      if (!result) {
        await react("❌");
        return reply(
          `❌ *${isVideoCmd ? "Video" : "Audio"} download failed*\n\n` +
            `Provider links were unreachable or expired. Please try again.`,
        );
      }

      if (result.meta.title) meta.title = meta.title || result.meta.title;
      if (result.meta.duration) meta.duration = meta.duration || result.meta.duration;

      // 3) Send Media
      if (isVideoCmd) {
        await sock.sendMessage(
          jid,
          {
            video: result.buf,
            mimetype: "video/mp4",
            fileName: `${meta.title || "video"}.mp4`,
            caption: mediaCaption(meta, botName, "video"),
          },
          { quoted: msg },
        );
      } else {
        await sendMedia({
          audio: result.buf,
          mimetype: "audio/mpeg",
          fileName: `${meta.title || "audio"}.mp3`,
          ptt: false,
        });
      }

      await react("✅");
    } catch (err) {
      console.error("[ YouTube ]", err.message);
      await react("❌").catch(() => {});
      reply(`❌ *Download failed:* ${err.message}`).catch(() => {});
    }
  },
};
