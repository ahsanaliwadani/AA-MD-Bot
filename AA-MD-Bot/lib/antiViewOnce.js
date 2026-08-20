// ============================================
// AA MD Bot - Anti View Once (Auto-Reveal Fixed)
// Developer: Ahsan Ali | AA Mods
// Pure Auto-Reveal & Emoji-Reply Reveal Engine
// ============================================

import moment from "moment-timezone";
import { jidNormalizedUser, downloadContentFromMessage } from "@whiskeysockets/baileys";
import { logger } from "./logger.js";
import { db } from "./database.js";
import config from "../config.js";

// ── Direct Download Helper ───────────────────────────────────────────────────
async function dlBufDirect(mediaMsg, type) {
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Quoted Media Extractor ───────────────────────────────────────────────────
function extractQuotedMediaForReveal(quotedMsg) {
  if (!quotedMsg) return null;
  const inner =
    quotedMsg?.viewOnceMessageV2?.message ||
    quotedMsg?.viewOnceMessageV2Extension?.message ||
    quotedMsg?.viewOnceMessage?.message ||
    quotedMsg?.ephemeralMessage?.message ||
    quotedMsg;

  if (inner?.imageMessage)
    return { mediaMsg: inner.imageMessage, isVid: false, isAudio: false, mime: inner.imageMessage.mimetype || "image/jpeg" };
  if (inner?.videoMessage)
    return { mediaMsg: inner.videoMessage, isVid: true, isAudio: false, mime: inner.videoMessage.mimetype || "video/mp4" };
  if (inner?.audioMessage)
    return { mediaMsg: inner.audioMessage, isVid: false, isAudio: true, mime: inner.audioMessage.mimetype || "audio/mp4" };

  if (quotedMsg?.imageMessage)
    return { mediaMsg: quotedMsg.imageMessage, isVid: false, isAudio: false, mime: quotedMsg.imageMessage.mimetype || "image/jpeg" };
  if (quotedMsg?.videoMessage)
    return { mediaMsg: quotedMsg.videoMessage, isVid: true, isAudio: false, mime: quotedMsg.videoMessage.mimetype || "video/mp4" };
  if (quotedMsg?.audioMessage)
    return { mediaMsg: quotedMsg.audioMessage, isVid: false, isAudio: true, mime: quotedMsg.audioMessage.mimetype || "audio/mp4" };

  return null;
}

// ── Memory Cache ─────────────────────────────────────────────────────────────
export const viewOnceStore = new Map();
const _MAX_STORE = 200;
const _processed = new Set();
const _PROCESSED_MAX = 200;

export function cleanViewOnceStore() {
  const now = Date.now();
  const MEM_TTL = 60 * 60 * 1000;
  for (const [key, val] of viewOnceStore.entries()) {
    if (now - val.timestamp > MEM_TTL) viewOnceStore.delete(key);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPhoneNum(jid) {
  if (!jid) return null;
  return jid.split("@")[0].split(":")[0];
}

function formatPhone(num) {
  if (!num) return "Unknown";
  return num.startsWith("+") ? num : `+${num}`;
}

function isOptEnabled(val) {
  if (val === true || val === 1) return true;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    return ["true", "on", "1", "enabled", "yes", "active"].includes(s);
  }
  return false;
}

function toUserJid(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (String(raw).includes("@")) {
    if (String(raw).includes("@lid")) return null;
    return jidNormalizedUser(String(raw));
  }
  const num = String(raw).replace(/\D/g, "");
  return num ? jidNormalizedUser(`${num}@s.whatsapp.net`) : null;
}

// Guaranteed Self-Chat JID Resolver using Baileys Native jidNormalizedUser
function getSelfJid(sock, sessionId) {
  const rawJid = sock?.user?.id || sock?.user?.jid || sock?.authState?.creds?.me?.id;
  if (rawJid) {
    const normalized = jidNormalizedUser(rawJid);
    if (normalized && !normalized.includes("@lid")) return normalized;
  }

  if (sessionId) {
    const sessJid = toUserJid(sessionId);
    if (sessJid) return sessJid;
  }

  return (
    toUserJid(db?.sessionSettings?.getValue(sessionId, "botJid")) ||
    toUserJid(db?.settings?.getValue("botJid")) ||
    toUserJid(config?.ownerNumber) ||
    toUserJid(config?.superOwner) ||
    null
  );
}

function extractViewOnceMedia(message) {
  function scan(node, insideViewOnce = false, depth = 0) {
    if (!node || depth > 10) return null;

    const wrappers = ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"];
    for (const wrapper of wrappers) {
      if (node[wrapper]?.message) {
        const found = scan(node[wrapper].message, true, depth + 1);
        if (found) return found;
      }
    }

    for (const wrapper of ["ephemeralMessage", "documentWithCaptionMessage"]) {
      if (node[wrapper]?.message) {
        const found = scan(node[wrapper].message, insideViewOnce, depth + 1);
        if (found) return found;
      }
    }

    if (node.imageMessage && (insideViewOnce || node.imageMessage.viewOnce)) {
      return { mediaMsg: node.imageMessage, isVid: false, isAudio: false };
    }
    if (node.videoMessage && (insideViewOnce || node.videoMessage.viewOnce)) {
      return { mediaMsg: node.videoMessage, isVid: true, isAudio: false };
    }
    if (node.audioMessage && (insideViewOnce || node.audioMessage.viewOnce)) {
      return { mediaMsg: node.audioMessage, isVid: false, isAudio: true };
    }
    return null;
  }

  return scan(message);
}

async function downloadBuffer(mediaMsg, isVid, isAudio = false) {
  const stream = await downloadContentFromMessage(
    mediaMsg,
    isAudio ? "audio" : isVid ? "video" : "image"
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Main Listener & Fixed Auto-Reveal Engine ─────────────────────────────────
export async function handleViewOnceMessage(msg, sock, sessionId) {
  if (!msg?.message || !msg?.key?.id) return;

  try {
    const msgId = msg.key.id;
    if (_processed.has(msgId)) return;

    const extracted = extractViewOnceMedia(msg.message);
    if (!extracted) return;

    const { mediaMsg, isVid, isAudio } = extracted;
    const mime = mediaMsg.mimetype || (isAudio ? "audio/mp4" : isVid ? "video/mp4" : "image/jpeg");
    const caption = mediaMsg.caption || "";
    const chatJid = msg.key.remoteJid;
    const inGroup = chatJid?.endsWith("@g.us");
    const senderJid = msg.key.participant || chatJid || "";
    const num = getPhoneNum(senderJid);
    const tz = config.timezone || "Asia/Karachi";

    let buf = null;
    try {
      buf = await downloadBuffer(mediaMsg, isVid, isAudio);
    } catch (e) {
      logger.warn({ err: e.message }, "ViewOnce media download failed");
    }
    if (!buf?.length) return;

    _processed.add(msgId);
    if (_processed.size > _PROCESSED_MAX) _processed.delete(_processed.values().next().value);

    const senderName =
      sock.contacts?.[senderJid]?.name || sock.contacts?.[senderJid]?.notify || formatPhone(num);

    const entry = {
      buf,
      mime,
      isVid,
      isAudio,
      num,
      inGroup,
      caption,
      chatJid,
      senderJid,
      senderName,
      timestamp: Date.now(),
    };
    viewOnceStore.set(msgId, entry);
    if (viewOnceStore.size > _MAX_STORE) viewOnceStore.delete(viewOnceStore.keys().next().value);

    // Flexible multi-key settings lookup
    const groupAntiVO = inGroup
      ? (db.groups?.get(sessionId, chatJid)?.antiviewonce ?? db.groups?.get(sessionId, chatJid)?.antiViewOnce)
      : undefined;

    const globalAntiVO =
      db.settings?.getValue("antiViewOnce") ??
      db.settings?.getValue("antiviewonce") ??
      db.settings?.getValue("autoViewOnce");

    const sessAntiVO =
      db.sessionSettings?.getValue(sessionId, "antiViewOnce") ??
      db.sessionSettings?.getValue(sessionId, "antiviewonce");

    const antiVOActive =
      isOptEnabled(groupAntiVO) || isOptEnabled(globalAntiVO) || isOptEnabled(sessAntiVO);

    // Send auto-reveal directly to self chat
    if (antiVOActive) {
      const selfJid = getSelfJid(sock, sessionId);

      if (selfJid) {
        const date = moment().tz(tz).format("DD/MM/YYYY");
        const timeStr = moment().tz(tz).format("HH:mm:ss");
        const cap =
          `🔓 *View-Once Auto-Saved*\n\n` +
          `👤 *From:* ${formatPhone(num)}\n` +
          `🕐 *Time:* ${timeStr}\n` +
          `📅 *Date:* ${date}\n` +
          `📍 *Chat:* ${inGroup ? "Group" : "DM"}\n` +
          (caption ? `💬 *Caption:* "${caption}"\n` : "") +
          `\n> 👁️ *AA MD Bot*`;

        try {
          if (isAudio) {
            await sock.sendMessage(selfJid, {
              audio: buf,
              mimetype: mime,
              ptt: mediaMsg?.ptt || false,
            });
            await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
          } else {
            await sock.sendMessage(
              selfJid,
              isVid
                ? { video: buf, caption: cap, mimetype: mime }
                : { image: buf, caption: cap, mimetype: mime }
            );
          }
          logger.info({ sessionId, selfJid }, "✅ ViewOnce successfully auto-revealed to self-chat");
        } catch (sendErr) {
          logger.error({ err: sendErr.message, selfJid }, "❌ Failed to send auto-reveal to self-chat");
        }
      } else {
        logger.warn({ sessionId }, "⚠️ Auto-reveal active but selfJid could not be resolved");
      }
    }
  } catch (e) {
    logger.warn({ err: e.message }, "ViewOnce main handler error");
  }
}

// ── Context and Emoji Parser Helpers ──────────────────────────────────────────
function extractContextInfo(m) {
  if (!m) return null;
  function* walk(obj, depth = 0) {
    if (!obj || depth > 8) return;
    for (const key of [
      "extendedTextMessage",
      "imageMessage",
      "videoMessage",
      "documentMessage",
      "audioMessage",
    ]) {
      if (obj[key]?.contextInfo) yield obj[key].contextInfo;
    }
    for (const wrapper of [
      "ephemeralMessage",
      "documentWithCaptionMessage",
      "viewOnceMessage",
      "viewOnceMessageV2",
      "viewOnceMessageV2Extension",
    ]) {
      if (obj[wrapper]?.message) yield* walk(obj[wrapper].message, depth + 1);
      if (obj[wrapper]) yield* walk(obj[wrapper], depth + 1);
    }
  }

  for (const ctx of walk(m)) {
    if (ctx?.stanzaId) return ctx;
  }
  for (const ctx of walk(m)) {
    return ctx;
  }
  return null;
}

function emojiSegmentsFromText(text) {
  if (!text) return [];
  const isEmoji = (s) => {
    if (!s) return false;
    const cp = s.codePointAt(0);
    if (s.length >= 2 && s.includes("\u20E3")) return true;
    if (cp >= 0x1f1e0 && cp <= 0x1f1ff) return true;
    if (cp >= 0x1f300) return true;
    if (cp >= 0x2600 && cp <= 0x27bf) return true;
    if (cp >= 0x2300 && cp <= 0x23ff) return true;
    if (cp >= 0xfe00) return true;
    return false;
  };

  try {
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((s) => s.segment).filter(isEmoji);
  } catch {
    return [...text].filter(isEmoji);
  }
}

function normalizeEmojiKey(emoji) {
  return String(emoji || "").replace(/[\uFE0E\uFE0F]/g, "").trim();
}

function getConfiguredVvEmojis() {
  const saved = db.settings?.getValue("vvEmojiSet");
  let emojis = [];

  if (Array.isArray(saved)) {
    emojis = saved.flatMap((item) => emojiSegmentsFromText(String(item)));
  } else if (typeof saved === "string") {
    emojis = emojiSegmentsFromText(saved);
  }

  if (!emojis.length) {
    emojis = ["👀", "🔓", "💠"];
  }

  return [...new Set(emojis.map(normalizeEmojiKey))];
}

function hasConfiguredVvEmoji(text) {
  const allowed = new Set(getConfiguredVvEmojis());
  const inputEmojis = emojiSegmentsFromText(text).map(normalizeEmojiKey);
  if (!allowed.size || !inputEmojis.length) return false;
  return inputEmojis.some((e) => allowed.has(e));
}

// ── Multi-Emoji Reply Reveal Handler ─────────────────────────────────────────
export async function handleReplyReveal(msg, sock, sessionId) {
  try {
    if (!msg?.key?.fromMe) return;

    const msgText = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    if (!msgText) return;

    const voKeyword = db.settings?.getValue("voKeyword");
    const prefix = db.settings?.getValue("prefix") || ".";

    const hasKeyword = !!(voKeyword && msgText.toLowerCase().includes(voKeyword.toLowerCase()));
    const textBody = msgText.startsWith(prefix) ? msgText.slice(prefix.length) : msgText;

    const isEmojiTrigger = hasConfiguredVvEmoji(textBody) || hasConfiguredVvEmoji(msgText);
    if (!hasKeyword && !isEmojiTrigger) return;

    const triggerLabel = isEmojiTrigger ? `emoji (${msgText})` : `keyword (${voKeyword})`;

    const ctxInfo = extractContextInfo(msg.message);
    const ctxInfoDirect0 =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      null;

    const hasReply = !!(ctxInfo?.stanzaId || ctxInfo?.quotedStanzaId || ctxInfoDirect0?.quotedMessage);
    if (!hasReply) return;

    const stanzaId = ctxInfo?.stanzaId || ctxInfo?.quotedStanzaId || null;
    let stored = stanzaId ? viewOnceStore.get(stanzaId) : null;

    if (!stored && stanzaId) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        stored = viewOnceStore.get(stanzaId);
        if (stored) break;
      }
    }

    const selfJid = getSelfJid(sock, sessionId);
    if (!selfJid) return;

    const tz = config.timezone || "Asia/Karachi";
    const date = moment().tz(tz).format("DD/MM/YYYY");
    const timeStr = moment().tz(tz).format("HH:mm:ss");

    // Direct Quoted Download Fallback
    try {
      const quotedMsg = ctxInfoDirect0?.quotedMessage;
      if (quotedMsg) {
        const extracted = extractQuotedMediaForReveal(quotedMsg);
        if (extracted) {
          const type = extracted.isAudio ? "audio" : extracted.isVid ? "video" : "image";
          const buf = await dlBufDirect(extracted.mediaMsg, type);
          if (buf?.length > 0) {
            const cap =
              `🔓 *View-Once Revealed*\n\n` +
              `📅 *Date:* ${date}\n` +
              `⏰ *Time:* ${timeStr}\n` +
              `🔑 *Trigger:* ${triggerLabel}\n\n` +
              `> 👁️ *AA MD Bot*`;

            if (extracted.isAudio) {
              await sock.sendMessage(selfJid, { audio: buf, mimetype: extracted.mime, ptt: false }).catch(() => {});
            } else if (extracted.isVid) {
              await sock.sendMessage(selfJid, { video: buf, caption: cap, mimetype: extracted.mime }).catch(() => {});
            } else {
              await sock.sendMessage(selfJid, { image: buf, caption: cap, mimetype: extracted.mime }).catch(() => {});
            }
            return;
          }
        }
      }
    } catch (_) {}

    if (!stored) return;

    const cap =
      `🔓 *View-Once Revealed*\n\n` +
      `👤 *From:* ${formatPhone(stored.num)}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${timeStr}\n` +
      `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
      `🔑 *Trigger:* ${triggerLabel}\n` +
      `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
      `> 👁️ *AA MD Bot*`;

    if (stored.isAudio) {
      await sock.sendMessage(selfJid, { audio: stored.buf, mimetype: stored.mime, ptt: false }).catch(() => {});
      await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
    } else {
      await sock.sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime }
      ).catch(() => {});
    }
  } catch (e) {
    logger.warn({ err: e.message }, "handleReplyReveal error");
  }
}

// ── Manual Reveal Handler (!reveal <msgId>) ──────────────────────────────────
export async function handleManualReveal(msgId, sock, chatJid) {
  try {
    if (!msgId || !chatJid) return;
    const stored = viewOnceStore.get(msgId);
    if (!stored) {
      await sock.sendMessage(chatJid, {
        text: `⚠️ No stored view-once media found for ID: ${msgId}`,
      }).catch(() => {});
      return;
    }

    const tz = config.timezone || "Asia/Karachi";
    const date = moment().tz(tz).format("DD/MM/YYYY");
    const timeStr = moment().tz(tz).format("HH:mm:ss");

    const cap =
      `🔓 *View-Once Revealed (Manual)*\n\n` +
      `👤 *From:* ${formatPhone(stored.num)}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${timeStr}\n` +
      `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
      `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
      `> 👁️ *AA MD Bot*`;

    if (stored.isAudio) {
      await sock.sendMessage(chatJid, { audio: stored.buf, mimetype: stored.mime, ptt: false }).catch(() => {});
      await sock.sendMessage(chatJid, { text: cap }).catch(() => {});
    } else {
      await sock.sendMessage(
        chatJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime }
      ).catch(() => {});
    }
  } catch (e) {
    logger.warn({ err: e.message }, "handleManualReveal error");
  }
}

// ── Reaction Reveal Handler (owner reacts with a saved vvEmoji) ──────────────
export async function handleReactionReveal(msg, sock, sessionId) {
  try {
    const reaction = msg?.message?.reactionMessage;
    if (!reaction) return;

    // Only act on the owner's own reactions
    if (!msg?.key?.fromMe && !reaction?.key?.fromMe) return;

    const emojiText = reaction.text || "";
    if (!emojiText || !hasConfiguredVvEmoji(emojiText)) return;

    const stanzaId = reaction.key?.id;
    if (!stanzaId) return;

    let stored = viewOnceStore.get(stanzaId);
    if (!stored) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        stored = viewOnceStore.get(stanzaId);
        if (stored) break;
      }
    }
    if (!stored) return;

    const selfJid = getSelfJid(sock, sessionId);
    if (!selfJid) return;

    const tz = config.timezone || "Asia/Karachi";
    const date = moment().tz(tz).format("DD/MM/YYYY");
    const timeStr = moment().tz(tz).format("HH:mm:ss");

    const cap =
      `🔓 *View-Once Revealed (Reaction)*\n\n` +
      `👤 *From:* ${formatPhone(stored.num)}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${timeStr}\n` +
      `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
      `🔑 *Trigger:* emoji (${emojiText})\n` +
      `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
      `> 👁️ *AA MD Bot*`;

    if (stored.isAudio) {
      await sock.sendMessage(selfJid, { audio: stored.buf, mimetype: stored.mime, ptt: false }).catch(() => {});
      await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
    } else {
      await sock.sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime }
      ).catch(() => {});
    }
  } catch (e) {
    logger.warn({ err: e.message }, "handleReactionReveal error");
  }
}
// ── Reveal By Reply Handler (msg, sock) → boolean ─────────────────────────────
// Used by .good/.reveal commands: walks the quoted-message contextInfo for a
// stanzaId, looks it up in viewOnceStore, and sends the media to self-chat.
// Returns true if something was found & sent, false otherwise.
export async function handleRevealByReply(msg, sock, sessionId) {
  try {
    const ctxInfo = extractContextInfo(msg?.message);
    const ctxInfoDirect =
      msg?.message?.extendedTextMessage?.contextInfo ||
      msg?.message?.imageMessage?.contextInfo ||
      msg?.message?.videoMessage?.contextInfo ||
      null;

    const stanzaId = ctxInfo?.stanzaId || ctxInfo?.quotedStanzaId || null;
    if (!stanzaId) return false;

    const stored = viewOnceStore.get(stanzaId);
    if (!stored) return false;

    const selfJid = getSelfJid(sock, sessionId || msg?.key?.remoteJid);
    if (!selfJid) return false;

    const tz = config.timezone || "Asia/Karachi";
    const date = moment().tz(tz).format("DD/MM/YYYY");
    const timeStr = moment().tz(tz).format("HH:mm:ss");

    const cap =
      `🔓 *View-Once Revealed*\n\n` +
      `👤 *From:* ${formatPhone(stored.num)}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${timeStr}\n` +
      `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
      `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
      `> 👁️ *AA MD Bot*`;

    if (stored.isAudio) {
      await sock.sendMessage(selfJid, { audio: stored.buf, mimetype: stored.mime, ptt: false }).catch(() => {});
      await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
    } else {
      await sock.sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime }
      ).catch(() => {});
    }
    return true;
  } catch (e) {
    logger.warn({ err: e.message }, "handleRevealByReply error");
    return false;
  }
}

export function initViewOnce() {
  setInterval(cleanViewOnceStore, 60_000);
  logger.info("👁️ ViewOnce Engine initialized with jidNormalizedUser self-chat fixes");
}
