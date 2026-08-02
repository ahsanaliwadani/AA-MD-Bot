// ============================================
// AA MD Bot - HD Media Sender (GB WhatsApp Feature)
// Sends images/videos back as documents so WhatsApp
// does NOT recompress them — full original quality.
// ============================================
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { generateId } from "../../lib/helper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "../../temp");

const IMAGE_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const VIDEO_EXT = {
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "video/quicktime": ".mov",
};

/**
 * getTargetMessage
 * Returns the message content to read media from: the quoted message if the
 * command was used as a reply, otherwise the command message itself.
 */
function getTargetMessage(msg) {
  const quotedInfo = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = quotedInfo?.quotedMessage;
  if (quoted) {
    return {
      message: quoted,
      key: {
        remoteJid: msg.key.remoteJid,
        id: quotedInfo.stanzaId,
        participant: quotedInfo.participant,
        fromMe: quotedInfo.participant
          ? quotedInfo.participant === msg.key.participant
          : msg.key.fromMe,
      },
    };
  }
  return { message: msg.message, key: msg.key };
}

function detectMediaType(message) {
  if (message?.imageMessage) return "image";
  if (message?.videoMessage) return "video";
  if (message?.viewOnceMessage?.message?.imageMessage) return "image";
  if (message?.viewOnceMessage?.message?.videoMessage) return "video";
  if (message?.viewOnceMessageV2?.message?.imageMessage) return "image";
  if (message?.viewOnceMessageV2?.message?.videoMessage) return "video";
  return null;
}

function unwrapMessage(message) {
  // View-once wrappers hold the real media one level deeper.
  return (
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message
  );
}

async function downloadHD(target, sock) {
  return downloadMediaMessage(
    target,
    "buffer",
    {},
    { reuploadRequest: sock.updateMediaMessage },
  );
}

/** sendHDImage: re-sends an image buffer as a document (no recompression). */
async function sendHDImage(
  { sock, jid, msg, reply },
  buffer,
  mimetype,
  caption,
) {
  const ext = IMAGE_EXT[mimetype] || ".jpg";
  await sock.sendMessage(
    jid,
    {
      document: buffer,
      fileName: `HD_Image_${generateId()}${ext}`,
      mimetype: mimetype || "image/jpeg",
      caption: caption
        ? `🖼️ *HD Image*\n\n${caption}`
        : "🖼️ *HD Image* — original quality, no compression",
    },
    { quoted: msg },
  );
}

/** sendHDVideo: re-sends a video buffer as a document (no recompression). */
async function sendHDVideo(
  { sock, jid, msg, reply },
  buffer,
  mimetype,
  caption,
) {
  const ext = VIDEO_EXT[mimetype] || ".mp4";
  await sock.sendMessage(
    jid,
    {
      document: buffer,
      fileName: `HD_Video_${generateId()}${ext}`,
      mimetype: mimetype || "video/mp4",
      caption: caption
        ? `🎬 *HD Video*\n\n${caption}`
        : "🎬 *HD Video* — original quality, no compression",
    },
    { quoted: msg },
  );
}

export default {
  command: "hd",
  alias: [
    "hdimg",
    "hdimage",
    "hdphoto",
    "hdvideo",
    "hdvid",
    "hdmedia",
    "quality",
  ],
  description:
    "Send images/videos in original HD quality (no WhatsApp compression)",
  category: "media",
  usage:
    "Reply to an image/video with .hd  |  Send an image/video with caption .hd",
  ownerOnly: false,
  async execute({ reply, sock, jid, msg, args }) {
    const target = getTargetMessage(msg);
    const realMessage = unwrapMessage(target.message);
    const type = detectMediaType(target.message);

    if (!type) {
      return reply(
        "❌ *No image or video found.*\n\n" +
          "📌 *How to use:*\n" +
          "▸ Reply to an *image* with *.hd* → sends it back in HD (as document)\n" +
          "▸ Reply to a *video* with *.hd* → sends it back in HD (as document)\n" +
          "▸ Send an image/video *with caption* *.hd* → same result\n\n" +
          "> 🤖 *Powered by AA MD Bot*",
      );
    }

    await reply(
      type === "image"
        ? "⏳ Preparing HD image..."
        : "⏳ Preparing HD video...",
    );

    fs.ensureDirSync(tmpDir);
    const id = generateId();
    let tmpPath;

    try {
      const downloadTarget = { message: realMessage, key: target.key };
      const buffer = await downloadHD(downloadTarget, sock);

      if (!buffer || buffer.length === 0) {
        throw new Error(
          "Failed to download media — the file may have expired.",
        );
      }

      const caption =
        realMessage.imageMessage?.caption ||
        realMessage.videoMessage?.caption ||
        (args.length ? args.join(" ") : "");

      if (type === "image") {
        const mimetype = realMessage.imageMessage?.mimetype || "image/jpeg";
        tmpPath = path.join(tmpDir, `${id}_hd${IMAGE_EXT[mimetype] || ".jpg"}`);
        await fs.writeFile(tmpPath, buffer);
        await sendHDImage({ sock, jid, msg, reply }, buffer, mimetype, caption);
      } else {
        const mimetype = realMessage.videoMessage?.mimetype || "video/mp4";
        tmpPath = path.join(tmpDir, `${id}_hd${VIDEO_EXT[mimetype] || ".mp4"}`);
        await fs.writeFile(tmpPath, buffer);
        await sendHDVideo({ sock, jid, msg, reply }, buffer, mimetype, caption);
      }
    } catch (err) {
      const message = String(err?.message || err);
      if (
        message.toLowerCase().includes("expired") ||
        message.toLowerCase().includes("download")
      ) {
        reply(
          "❌ Could not download the media. It may have expired or already been viewed (view-once).",
        );
      } else {
        reply(
          "❌ Failed to process HD media. Please try again in a few seconds.",
        );
      }
    } finally {
      if (tmpPath) await fs.remove(tmpPath).catch(() => {});
    }
  },
};
