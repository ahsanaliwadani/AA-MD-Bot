// ============================================
// AA MD Bot - Anti View Once
// Developer: Ahsan Ali | AA Mods
// Captures view-once media, stores for manual reveal
// via !reveal <msgId>, and auto-reveals to owner's
// private "You" chat when antiviewonce is ON or the
// view-once caption contains the configured keyword.
// ============================================

import moment from "moment-timezone";
import { logger } from "./logger.js";
import { db } from "./database.js";
import config from "../config.js";

// ── Direct-download helper ────────────────────────────────────────────────────
async function dlBufDirect(mediaMsg, type) {
  const { downloadContentFromMessage } = await import(
    "@whiskeysockets/baileys"
  );
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Extract media from a quotedMessage object ─────────────────────────────────
function extractQuotedMediaForReveal(quotedMsg) {
  if (!quotedMsg) return null;
  const inner =
    quotedMsg?.viewOnceMessageV2?.message ||
    quotedMsg?.viewOnceMessageV2Extension?.message ||
    quotedMsg?.viewOnceMessage?.message ||
    quotedMsg?.ephemeralMessage?.message ||
    quotedMsg;
  if (inner?.imageMessage)
    return {
      mediaMsg: inner.imageMessage,
      isVid: false,
      isAudio: false,
      mime: inner.imageMessage.mimetype || "image/jpeg",
    };
  if (inner?.videoMessage)
    return {
      mediaMsg: inner.videoMessage,
      isVid: true,
      isAudio: false,
      mime: inner.videoMessage.mimetype || "video/mp4",
    };
  if (inner?.audioMessage)
    return {
      mediaMsg: inner.audioMessage,
      isVid: false,
      isAudio: true,
      mime: inner.audioMessage.mimetype || "audio/mp4",
    };
  if (quotedMsg?.imageMessage)
    return {
      mediaMsg: quotedMsg.imageMessage,
      isVid: false,
      isAudio: false,
      mime: quotedMsg.imageMessage.mimetype || "image/jpeg",
    };
  if (quotedMsg?.videoMessage)
    return {
      mediaMsg: quotedMsg.videoMessage,
      isVid: true,
      isAudio: false,
      mime: quotedMsg.videoMessage.mimetype || "video/mp4",
    };
  if (quotedMsg?.audioMessage)
    return {
      mediaMsg: quotedMsg.audioMessage,
      isVid: false,
      isAudio: true,
      mime: quotedMsg.audioMessage.mimetype || "audio/mp4",
    };
  return null;
}

// ── Storage ───────────────────────────────────────────────────────────────────
export const viewOnceStore = new Map();
const _MAX_STORE = 200;
const _processed = new Set();
const _PROCESSED_MAX = 200;

// ── Periodic cleanup (60-minute in-memory TTL) ────────────────────────────────
export function cleanViewOnceStore() {
  const now = Date.now();
  const MEM_TTL = 60 * 60 * 1000;
  for (const [key, val] of viewOnceStore.entries()) {
    if (now - val.timestamp > MEM_TTL) viewOnceStore.delete(key);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPhoneNum(jid) {
  if (!jid) return null;
  return jid.split("@")[0].split(":")[0];
}

function formatPhone(num) {
  if (!num) return "Unknown";
  return num.startsWith("+") ? num : `+${num}`;
}

function isSameJidOrLid(jid1, jid2) {
  if (!jid1 || !jid2) return false;
  const clean1 = String(jid1).split("@")[0].split(":")[0];
  const clean2 = String(jid2).split("@")[0].split(":")[0];
  return clean1 === clean2;
}

function isOptEnabled(val) {
  if (val === true || val === 1) return true;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    return s === "true" || s === "on" || s === "1" || s === "enabled" || s === "yes";
  }
  return false;
}

function toUserJid(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (String(raw).includes('@')) {
    if (String(raw).includes('@lid')) return null;
    return String(raw);
  }
  const num = String(raw).replace(/\D/g, '');
  return num ? `${num}@s.whatsapp.net` : null;
}

function getSelfJid(sock, sessionId) {
  const rawUser = sock?.user?.id || sock?.user?.jid || sock?.authState?.creds?.me?.id || '';
  if (rawUser && !rawUser.includes('@lid')) {
    const num = rawUser.split('@')[0]?.split(':')[0];
    if (num && /^\d+$/.test(num)) return `${num}@s.whatsapp.net`;
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

// ── Reaction Sender Authorization (Supports Phone Numbers & LID) ─────────────
function isAuthorizedReactionSender(msg, sock, sessionId) {
  if (msg?.key?.fromMe || msg?.reaction?.key?.fromMe) return true;

  const inGroup = msg?.key?.remoteJid?.endsWith("@g.us");
  const reactionObj = msg?.message?.reactionMessage || msg?.reaction;

  const senderJid =
    msg?.key?.participant ||
    reactionObj?.key?.participant ||
    (inGroup ? null : msg?.key?.remoteJid) ||
    null;

  if (!senderJid) return false;

  const senderNum = getPhoneNum(senderJid);

  // 1. Match against Self Phone Number
  const selfJid = getSelfJid(sock, sessionId);
  const selfNum = getPhoneNum(selfJid);
  if (senderNum && selfNum && senderNum === selfNum) return true;

  // 2. Match against Self LID
  const selfLid =
    sock?.user?.lid ||
    sock?.authState?.creds?.me?.lid ||
    db?.sessionSettings?.getValue(sessionId, "botLid") ||
    "";
  if (selfLid && isSameJidOrLid(senderJid, selfLid)) return true;

  // 3. Match against Bot JID
  const botJid = db?.settings?.getValue("botJid");
  if (senderNum && botJid && senderNum === getPhoneNum(botJid)) return true;

  // 4. Match against Super Owner
  const superOwner = String(db?.settings?.getValue("superOwner") || config?.superOwner || "");
  if (senderNum && superOwner && getPhoneNum(superOwner) === senderNum) return true;

  // 5. Match against Owners List
  const owners = db?.settings?.getValue("owners") || config?.owners || [];
  for (const owner of owners) {
    if (!owner) continue;
    if (senderNum && getPhoneNum(owner) === senderNum) return true;
    if (isSameJidOrLid(senderJid, owner)) return true;
  }

  return false;
}

function normalizeMsg(message) {
  let m = message;
  for (let i = 0; i < 8; i++) {
    const next =
      m?.ephemeralMessage?.message ||
      m?.documentWithCaptionMessage?.message ||
      m?.viewOnceMessage?.message ||
      m?.viewOnceMessageV2?.message ||
      m?.viewOnceMessageV2Extension?.message ||
      null;
    if (!next) break;
    m = next;
  }
  return m;
}

function extractViewOnceMedia(message) {
  function scan(node, insideViewOnce = false, depth = 0) {
    if (!node || depth > 10) return null;

    const wrappers = [
      'viewOnceMessage',
      'viewOnceMessageV2',
      'viewOnceMessageV2Extension',
    ];
    for (const wrapper of wrappers) {
      if (node[wrapper]?.message) {
        const found = scan(node[wrapper].message, true, depth + 1);
        if (found) return found;
      }
    }

    for (const wrapper of ['ephemeralMessage', 'documentWithCaptionMessage']) {
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
  const { downloadContentFromMessage } = await import(
    "@whiskeysockets/baileys"
  );
  const stream = await downloadContentFromMessage(
    mediaMsg,
    isAudio ? "audio" : isVid ? "video" : "image",
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
    const time = new Date().toLocaleString("en-PK", {
      timeZone: tz,
      hour12: true,
    });

    logger.info(
      { sessionId, msgId, chat: chatJid, isVid },
      "👁️ ViewOnce detected — downloading",
    );

    let buf = null;
    try {
      buf = await downloadBuffer(mediaMsg, isVid, isAudio);
    } catch (e) {
      logger.warn({ err: e.message }, "ViewOnce download failed");
    }
    if (!buf?.length) return;

    _processed.add(msgId);
    if (_processed.size > _PROCESSED_MAX)
      _processed.delete(_processed.values().next().value);

    const senderName =
      sock.contacts?.[senderJid]?.name ||
      sock.contacts?.[senderJid]?.notify ||
      formatPhone(num);
    const entry = {
      buf,
      mime,
      isVid,
      isAudio,
      num,
      time,
      inGroup,
      caption,
      chatJid,
      senderJid,
      senderName,
      timestamp: Date.now(),
    };
    viewOnceStore.set(msgId, entry);
    if (viewOnceStore.size > _MAX_STORE)
      viewOnceStore.delete(viewOnceStore.keys().next().value);

    logger.info(
      { sessionId, msgId, bytes: buf.length },
      "✅ ViewOnce cached (memory only)",
    );

    // Auto-reply to sender if configured
    const autoReply = db.settings.getValue("voAutoReply");
    if (autoReply && !msg.key.fromMe) {
      await sock.sendMessage(chatJid, { text: autoReply }).catch(() => {});
    }

    // Auto-forward to owner's self chat when antiViewOnce is enabled
    const groupAntiVO = inGroup
      ? db.groups.get(sessionId, chatJid)?.antiviewonce
      : undefined;
    const globalAntiVO = db.settings.getValue("antiViewOnce");
    const sessAntiVO   = db.sessionSettings.getValue(sessionId, "antiViewOnce");
    const antiVOActive = isOptEnabled(groupAntiVO) || isOptEnabled(globalAntiVO) || isOptEnabled(sessAntiVO);

    if (antiVOActive && !msg.key.fromMe) {
      const selfJid = getSelfJid(sock, sessionId);

      logger.info(
        { sessionId, selfJid },
        "👁️ ViewOnce auto-reveal: sending to self-chat",
      );

      if (selfJid) {
        const date = moment().tz(tz).format("DD/MM/YYYY");
        const timeStr = moment().tz(tz).format("HH:mm:ss");
        const cap =
          `🔓 *View-Once Auto-Saved*\n\n` +
          `👤 *From:* ${formatPhone(num)}\n` +
          `🕐 *Time:* ${timeStr}\n` +
          `📅 *Date:* ${date}\n` +
          `📍 *Chat:* ${inGroup ? "Group" : "DM"}\n` +
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
                : { image: buf, caption: cap, mimetype: mime },
            );
          }
          logger.info({ sessionId, selfJid }, "✅ ViewOnce auto-reveal sent");
        } catch (sendErr) {
          logger.warn({ err: sendErr.message, selfJid }, "❌ ViewOnce auto-reveal send FAILED");
        }
      } else {
        logger.warn({ sessionId }, "👁️ ViewOnce auto-reveal: selfJid unavailable");
      }
    }
  } catch (e) {
    logger.warn({ err: e.message, stack: e.stack }, "ViewOnce handler threw");
  }
}

// ── Helpers for reply reveal ──────────────────────────────────────────────────
function extractText(m) {
  if (!m) return "";
  const norm = normalizeMsg(m);
  return (
    norm?.conversation ||
    norm?.extendedTextMessage?.text ||
    norm?.imageMessage?.caption ||
    norm?.videoMessage?.caption ||
    norm?.documentMessage?.caption ||
    norm?.audioMessage?.caption ||
    norm?.buttonsResponseMessage?.selectedDisplayText ||
    norm?.listResponseMessage?.title ||
    ""
  );
}

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
      "buttonsResponseMessage",
      "listResponseMessage",
      "stickerMessage",
      "contactMessage",
      "locationMessage",
      "templateButtonReplyMessage",
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

// ── Emoji trigger detection ───────────────────────────────────────────────────
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
  return String(emoji || "").replace(/[\uFE0E\uFE0F]/g, "");
}

function getConfiguredVvEmojis() {
  const saved = db.settings.getValue("vvEmojiSet");
  if (Array.isArray(saved)) return saved.filter(Boolean);
  if (typeof saved === "string") return emojiSegmentsFromText(saved);
  return ["👀", "🔓", "💠"];
}

function hasConfiguredVvEmoji(text) {
  const allowed = new Set(getConfiguredVvEmojis().map(normalizeEmojiKey));
  const emojis = emojiSegmentsFromText(text).map(normalizeEmojiKey);
  if (!allowed.size || !emojis.length) return false;
  return emojis.some((emoji) => allowed.has(emoji));
}

function legacyEmojiRevealEnabled() {
  return isOptEnabled(db.settings.getValue("emojiRevealEnabled"));
}

function isVvReplyRevealEnabled() {
  const explicit = db.settings.getValue("emojiReplyRevealEnabled");
  return explicit === undefined ? legacyEmojiRevealEnabled() : isOptEnabled(explicit);
}

function isVvReactionRevealEnabled() {
  const explicit = db.settings.getValue("emojiReactionRevealEnabled");
  return explicit === undefined ? legacyEmojiRevealEnabled() : isOptEnabled(explicit);
}

function hasFourSameEmoji(text) {
  const counts = {};
  for (const e of emojiSegmentsFromText(text)) {
    counts[e] = (counts[e] || 0) + 1;
    if (counts[e] >= 4) return true;
  }
  return false;
}

// ── Reply-based reveal ───────────────────────────────────────────────────────
export async function handleReplyReveal(msg, sock, sessionId) {
  try {
    if (!msg?.key?.fromMe) return;

    const msgText = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    if (!msgText) return;

    const voKeyword = db.settings.getValue("voKeyword");
    const prefix = db.settings.getValue("prefix") || ".";
    const emojiEnabled = isVvReplyRevealEnabled();

    const hasKeyword = !!(
      voKeyword && msgText.toLowerCase().includes(voKeyword.toLowerCase())
    );

    const textBody = msgText.startsWith(prefix)
      ? msgText.slice(prefix.length)
      : msgText;
    const isEmojiTrigger =
      emojiEnabled && textBody.length > 0 && (
        hasConfiguredVvEmoji(textBody) || hasFourSameEmoji(textBody)
      );

    if (!hasKeyword && !isEmojiTrigger) return;

    const triggerLabel = isEmojiTrigger
      ? "emoji-trigger"
      : `keyword(${voKeyword})`;

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
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        stored = viewOnceStore.get(stanzaId);
        if (stored) break;
      }
    }

    if (!stored && stanzaId) {
      const chatJid = msg.key.remoteJid;
      const TTL = 60 * 60 * 1000;
      let newest = null;
      for (const [, entry] of viewOnceStore) {
        if (entry.chatJid === chatJid) {
          if (!newest || entry.timestamp > newest.timestamp) newest = entry;
        }
      }
      if (newest && Date.now() - newest.timestamp < TTL) stored = newest;
    }

    const selfJid = getSelfJid(sock, sessionId);
    if (!selfJid) return;

    const tz = config.timezone || "Asia/Karachi";
    const date = moment().tz(tz).format("DD/MM/YYYY");
    const timeStr = moment().tz(tz).format("HH:mm:ss");

    try {
      const ctxInfoDirect =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo ||
        null;
      const quotedMsg = ctxInfoDirect?.quotedMessage;
      if (quotedMsg) {
        const extracted = extractQuotedMediaForReveal(quotedMsg);
        if (extracted) {
          const type = extracted.isAudio
            ? "audio"
            : extracted.isVid
              ? "video"
              : "image";
          const buf = await dlBufDirect(extracted.mediaMsg, type);
          if (buf?.length > 0) {
            const cap =
              `🔓 *View-Once Revealed*\n\n` +
              `📅 *Date:* ${date}\n` +
              `⏰ *Time:* ${timeStr}\n` +
              `🔑 *Trigger:* ${triggerLabel}\n\n` +
              `> 👁️ *AA MD Bot*`;
            if (extracted.isAudio) {
              await sock
                .sendMessage(selfJid, {
                  audio: buf,
                  mimetype: extracted.mime,
                  ptt: extracted.mediaMsg?.ptt || false,
                })
                .catch(() => {});
            } else if (extracted.isVid) {
              await sock
                .sendMessage(selfJid, {
                  video: buf,
                  caption: cap,
                  mimetype: extracted.mime,
                })
                .catch(() => {});
            } else {
              await sock
                .sendMessage(selfJid, {
                  image: buf,
                  caption: cap,
                  mimetype: extracted.mime,
                })
                .catch(() => {});
            }
            logger.info(
              { sessionId, trigger: triggerLabel },
              "🔑 ViewOnce revealed via emoji trigger (direct)",
            );
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
      await sock
        .sendMessage(selfJid, {
          audio: stored.buf,
          mimetype: stored.mime,
          ptt: false,
        })
        .catch(() => {});
      await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
    } else {
      await sock
        .sendMessage(
          selfJid,
          stored.isVid
            ? { video: stored.buf, caption: cap, mimetype: stored.mime }
            : { image: stored.buf, caption: cap, mimetype: stored.mime },
        )
        .catch(() => {});
    }

    logger.info(
      { sessionId, stanzaId, trigger: triggerLabel },
      "🔑 ViewOnce revealed via emoji trigger (store)",
    );
  } catch (e) {
    logger.warn({ err: e.message }, "handleReplyReveal threw");
  }
}

// ── Reaction-based reveal ─────────────────────────────────────────────────────
export async function handleReactionReveal(rawMsg, sock, sessionId) {
  try {
    const msg =
      rawMsg?.reaction && !rawMsg?.message
        ? { key: rawMsg.key, message: { reactionMessage: rawMsg.reaction } }
        : rawMsg;

    const reaction = normalizeMsg(msg?.message)?.reactionMessage;
    const emojiText = reaction?.text || "";
    const targetKey = reaction?.key || null;
    const targetId = targetKey?.id || null;

    if (!targetId || !emojiText) {
      logger.info(
        { sessionId, hasTargetId: !!targetId, hasEmojiText: !!emojiText },
        "👁️ ReactionReveal: skipped — missing targetId or emoji text",
      );
      return false;
    }

    if (!isAuthorizedReactionSender(msg, sock, sessionId)) {
      logger.info(
        { sessionId, targetId, fromMe: msg?.key?.fromMe, participant: msg?.key?.participant, remoteJid: msg?.key?.remoteJid },
        "👁️ ReactionReveal: rejected — sender not authorized",
      );
      return false;
    }

    const emojiEnabled = isVvReactionRevealEnabled();
    if (!emojiEnabled) {
      logger.info({ sessionId, targetId }, "👁️ ReactionReveal: skipped — reaction reveal disabled in settings");
      return false;
    }

    if (!hasConfiguredVvEmoji(emojiText)) {
      logger.info(
        { sessionId, targetId, emojiText, configured: getConfiguredVvEmojis() },
        "👁️ ReactionReveal: skipped — emoji not in configured set",
      );
      return false;
    }

    let stored = viewOnceStore.get(targetId);
    if (!stored) {
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        stored = viewOnceStore.get(targetId);
        if (stored) break;
      }
    }
    if (!stored) {
      const targetChat = targetKey?.remoteJid || msg.key?.remoteJid;
      const TTL = 60 * 60 * 1000;
      let newest = null;
      for (const [, entry] of viewOnceStore) {
        if (entry.chatJid === targetChat && (!newest || entry.timestamp > newest.timestamp)) newest = entry;
      }
      if (newest && Date.now() - newest.timestamp < TTL) stored = newest;
    }
    if (!stored) {
      logger.info(
        { sessionId, targetId, storeSize: viewOnceStore.size },
        "👁️ ReactionReveal: skipped — target not found in viewOnceStore",
      );
      return false;
    }

    const selfJid = getSelfJid(sock, sessionId);
    if (!selfJid) {
      logger.warn({ sessionId }, "👁️ ReactionReveal: selfJid could not be resolved");
      return false;
    }

    const tz = config.timezone || "Asia/Karachi";
    const date = moment().tz(tz).format("DD/MM/YYYY");
    const timeStr = moment().tz(tz).format("HH:mm:ss");
    const cap =
      `🔓 *View-Once Revealed*\n\n` +
      `👤 *From:* ${formatPhone(stored.num)}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${timeStr}\n` +
      `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
      `🔑 *Trigger:* reaction ${emojiText}\n` +
      `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
      `> 👁️ *AA MD Bot*`;

    if (stored.isAudio) {
      await sock.sendMessage(selfJid, {
        audio: stored.buf,
        mimetype: stored.mime,
        ptt: false,
      }).catch(() => {});
      await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
    } else {
      await sock.sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime },
      ).catch(() => {});
    }

    logger.info(
      { sessionId, stanzaId: targetId, trigger: emojiText },
      "🔑 ViewOnce revealed via reaction emoji",
    );
    return true;
  } catch (e) {
    logger.warn({ err: e.message, stack: e.stack }, "handleReactionReveal threw");
    return false;
  }
}

// ── Manual reveal ─────────────────────────────────────────────────────────────
export async function handleManualReveal(msgId, sock, replyJid) {
  const selfJid = getSelfJid(sock, null);
  if (!selfJid) return;

  const id = msgId?.trim();
  const stored = viewOnceStore.get(id);

  if (!stored) {
    await sock
      .sendMessage(selfJid, {
        text:
          `❌ *View-Once not found*\n\n` +
          `Message ID not in cache.\n` +
          `Make sure the bot was running when the view-once arrived,\n` +
          `and that you're replying to the original message.\n\n` +
          `> 👁️ *AA MD Bot*`,
      })
      .catch(() => {});
    return;
  }

  const cap =
    `🔓 *View-Once Revealed (Manual)*\n\n` +
    `👤 *From:* ${formatPhone(stored.num)}\n` +
    `🕐 *Time:* ${stored.time}\n` +
    `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
    `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
    `> 👁️ *AA MD Bot*`;

  if (stored.isAudio) {
    await sock
      .sendMessage(selfJid, {
        audio: stored.buf,
        mimetype: stored.mime,
        ptt: false,
      })
      .catch(() => {});
    await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
  } else {
    await sock
      .sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime },
      )
      .catch(() => {});
  }
}

// ── Reveal by quoted message ─────────────────────────────────────────────────
export async function handleRevealByReply(msg, sock) {
  const selfJid = getSelfJid(sock, null);
  if (!selfJid) return false;

  const ctxInfo = extractContextInfo(msg.message);
  const stanzaId = ctxInfo?.stanzaId;
  if (!stanzaId) return false;

  const stored = viewOnceStore.get(stanzaId);
  if (!stored) return false;

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
    await sock
      .sendMessage(selfJid, {
        audio: stored.buf,
        mimetype: stored.mime,
        ptt: false,
      })
      .catch(() => {});
    await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
  } else {
    await sock
      .sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime },
      )
      .catch(() => {});
  }

  return true;
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initViewOnce() {
  setInterval(cleanViewOnceStore, 60_000);
  logger.info("👁️ ViewOnce feature initialized");
  logger.info("👁️ Auto-reveal: .antiviewonce on/off");
  logger.info("👁️ Emoji reveal: separate reply/react triggers via .vvemoji reply|react on/off");
  logger.info("👁️ Manual reveal: .avv in reply to a view-once message");
}
