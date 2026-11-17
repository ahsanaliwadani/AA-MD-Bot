// ============================================
// AA MD Bot - Anti View Once (v2 - optimized)
// Developer: Ahsan Ali | AA Mods
// Auto-Reveal + Reply/Emoji/Reaction Reveal Engine
// ============================================

import moment from "moment-timezone";
import { jidNormalizedUser, downloadContentFromMessage } from "@whiskeysockets/baileys";
import { logger } from "./logger.js";
import { db } from "./database.js";
import config from "../config.js";

// ── Constants ────────────────────────────────────────────────────────────────
const MEM_TTL = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB RAM cap for all stored media
const MAX_ITEM_BYTES = 64 * 1024 * 1024; // skip single files bigger than 64 MB
const PROCESSED_MAX = 500;
const DEFAULT_EMOJIS = ["👀", "🔓", "💠"];

// ── State ────────────────────────────────────────────────────────────────────
export const viewOnceStore = new Map();
let totalBytes = 0;
const processed = new Set(); // finished message ids
const inflight = new Set(); // ids currently downloading (prevents double-processing)
const recent = new Map(); // short cooldown against duplicate triggers
const groupNameCache = new Map();
let cleanupTimer = null;

// ── Small utils ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function claim(key, ms = 4000) {
  const now = Date.now();
  const t = recent.get(key);
  if (t && now - t < ms) return false;
  recent.set(key, now);
  if (recent.size > 200) {
    for (const [k, v] of recent) if (now - v > ms) recent.delete(k);
  }
  return true;
}

function stamp() {
  const tz = config.timezone || "Asia/Karachi";
  const m = moment().tz(tz);
  return { date: m.format("DD/MM/YYYY"), timeStr: m.format("HH:mm:ss") };
}

function mediaType(isVid, isAudio) {
  return isAudio ? "audio" : isVid ? "video" : "image";
}

// ── Store management (RAM safe) ──────────────────────────────────────────────
function storeDelete(id) {
  const e = viewOnceStore.get(id);
  if (e) {
    totalBytes -= e.buf?.length || 0;
    viewOnceStore.delete(id);
  }
}

function storeAdd(id, entry) {
  if (viewOnceStore.has(id)) storeDelete(id);
  viewOnceStore.set(id, entry);
  totalBytes += entry.buf.length;
  while ((viewOnceStore.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) && viewOnceStore.size > 1) {
    storeDelete(viewOnceStore.keys().next().value);
  }
}

export function cleanViewOnceStore() {
  const now = Date.now();
  for (const [key, val] of viewOnceStore.entries()) {
    if (now - val.timestamp > MEM_TTL) viewOnceStore.delete(key);
  }
  // re-sync byte counter (in case something deleted from the Map directly)
  totalBytes = 0;
  for (const v of viewOnceStore.values()) totalBytes += v.buf?.length || 0;
}

async function waitForStored(id, tries = 12, step = 250) {
  for (let i = 0; i <= tries; i++) {
    const s = viewOnceStore.get(id);
    if (s) return s;
    if (i < tries) await sleep(step);
  }
  return null;
}

// ── Download with retry ──────────────────────────────────────────────────────
async function downloadBuffer(mediaMsg, type, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const stream = await downloadContentFromMessage(mediaMsg, type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length) return buf;
      lastErr = new Error("empty buffer");
    } catch (e) {
      lastErr = e;
    }
    if (i < tries - 1) await sleep(500 * (i + 1));
  }
  throw lastErr;
}

// ── Unified media finder (view-once or quoted) ───────────────────────────────
function findMedia(message, requireViewOnce) {
  const VO_WRAPPERS = ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"];
  const PLAIN_WRAPPERS = ["ephemeralMessage", "documentWithCaptionMessage"];

  function scan(node, insideVO, depth) {
    if (!node || typeof node !== "object" || depth > 10) return null;

    for (const w of VO_WRAPPERS) {
      if (node[w]?.message) {
        const f = scan(node[w].message, true, depth + 1);
        if (f) return f;
      }
    }
    for (const w of PLAIN_WRAPPERS) {
      if (node[w]?.message) {
        const f = scan(node[w].message, insideVO, depth + 1);
        if (f) return f;
      }
    }

    const kinds = [
      ["imageMessage", false, false, "image/jpeg"],
      ["videoMessage", true, false, "video/mp4"],
      ["audioMessage", false, true, "audio/mp4"],
    ];
    for (const [key, isVid, isAudio, defMime] of kinds) {
      const m = node[key];
      if (m && (!requireViewOnce || insideVO || m.viewOnce)) {
        return { mediaMsg: m, isVid, isAudio, mime: m.mimetype || defMime };
      }
    }
    return null;
  }

  return scan(message, false, 0);
}

// ── JID / sender helpers ─────────────────────────────────────────────────────
function getPhoneNum(jid) {
  if (!jid) return null;
  return String(jid).split("@")[0].split(":")[0];
}

function formatPhone(num) {
  if (!num) return "Unknown";
  return num.startsWith("+") ? num : `+${num}`;
}

function resolveSender(key) {
  const inGroup = key?.remoteJid?.endsWith("@g.us");
  const cands = [
    key?.participant,
    key?.participantAlt,
    key?.participantPn,
    key?.senderPn,
    key?.remoteJidAlt,
    inGroup ? null : key?.remoteJid,
  ].filter(Boolean);
  // prefer a real phone-number JID over a @lid one
  return cands.find((j) => !String(j).includes("@lid")) || cands[0] || "";
}

function isOptEnabled(val) {
  if (val === true || val === 1) return true;
  if (typeof val === "string") {
    return ["true", "on", "1", "enabled", "yes", "active"].includes(val.trim().toLowerCase());
  }
  return false;
}

function toUserJid(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const s = String(raw);
  if (s.includes("@")) {
    if (s.includes("@lid")) return null;
    return jidNormalizedUser(s);
  }
  const num = s.replace(/\D/g, "");
  return num ? jidNormalizedUser(`${num}@s.whatsapp.net`) : null;
}

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
    toUserJid(safe(() => db?.sessionSettings?.getValue(sessionId, "botJid"))) ||
    toUserJid(safe(() => db?.settings?.getValue("botJid"))) ||
    toUserJid(config?.ownerNumber) ||
    toUserJid(config?.superOwner) ||
    null
  );
}

async function getGroupName(sock, jid) {
  if (groupNameCache.has(jid)) return groupNameCache.get(jid);
  try {
    const meta = await Promise.race([sock.groupMetadata(jid), sleep(1500).then(() => null)]);
    if (meta?.subject) {
      if (groupNameCache.size > 100) groupNameCache.delete(groupNameCache.keys().next().value);
      groupNameCache.set(jid, meta.subject);
      return meta.subject;
    }
  } catch {}
  return null;
}

// ── Settings ─────────────────────────────────────────────────────────────────
function isAntiVOActive(sessionId, chatJid, inGroup) {
  const gs = inGroup ? safe(() => db.groups?.get(sessionId, chatJid)) : null;
  const groupVal = gs?.antiviewonce ?? gs?.antiViewOnce;

  const globalVal = safe(
    () =>
      db.settings?.getValue("antiViewOnce") ??
      db.settings?.getValue("antiviewonce") ??
      db.settings?.getValue("autoViewOnce")
  );

  const sessVal = safe(
    () =>
      db.sessionSettings?.getValue(sessionId, "antiViewOnce") ??
      db.sessionSettings?.getValue(sessionId, "antiviewonce")
  );

  return isOptEnabled(groupVal) || isOptEnabled(globalVal) || isOptEnabled(sessVal);
}

// ── Emoji helpers (Unicode-property based, Urdu/Arabic text safe) ────────────
const EMOJI_TEST = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

function graphemes(text) {
  if (!text) return [];
  try {
    const seg = new Intl.Segmenter("und", { granularity: "grapheme" });
    return [...seg.segment(text)].map((s) => s.segment);
  } catch {
    return [...text];
  }
}

function emojiSegmentsFromText(text) {
  return graphemes(text).filter((g) => EMOJI_TEST.test(g));
}

function isOnlyEmoji(text) {
  const parts = graphemes(text).filter((g) => g.trim());
  return parts.length > 0 && parts.every((g) => EMOJI_TEST.test(g));
}

function normalizeEmojiKey(emoji) {
  return String(emoji || "").replace(/[\uFE0E\uFE0F]/g, "").trim();
}

function getConfiguredVvEmojis() {
  const saved = safe(() => db.settings?.getValue("vvEmojiSet"));
  let emojis = [];
  if (Array.isArray(saved)) emojis = saved.flatMap((i) => emojiSegmentsFromText(String(i)));
  else if (typeof saved === "string") emojis = emojiSegmentsFromText(saved);
  if (!emojis.length) emojis = DEFAULT_EMOJIS;
  return [...new Set(emojis.map(normalizeEmojiKey))];
}

function hasConfiguredVvEmoji(text) {
  const allowed = new Set(getConfiguredVvEmojis());
  const input = emojiSegmentsFromText(text).map(normalizeEmojiKey);
  return input.some((e) => allowed.has(e));
}

// ── Context info ─────────────────────────────────────────────────────────────
function extractContextInfo(m) {
  if (!m) return null;
  const found = [];
  const KINDS = ["extendedTextMessage", "imageMessage", "videoMessage", "documentMessage", "audioMessage"];
  const WRAPS = [
    "ephemeralMessage",
    "documentWithCaptionMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
  ];

  (function walk(obj, depth) {
    if (!obj || typeof obj !== "object" || depth > 8) return;
    for (const k of KINDS) if (obj[k]?.contextInfo) found.push(obj[k].contextInfo);
    for (const w of WRAPS) {
      if (obj[w]?.message) walk(obj[w].message, depth + 1);
      else if (obj[w]) walk(obj[w], depth + 1);
    }
  })(m, 0);

  return found.find((c) => c?.stanzaId) || found[0] || null;
}

// ── Caption + Sender ─────────────────────────────────────────────────────────
function buildCaption(title, info = {}) {
  const { date, timeStr } = stamp();
  const lines = [`🔓 *${title}*`, ""];
  if (info.phone) {
    lines.push(`👤 *From:* ${info.name && info.name !== info.phone ? `${info.name} (${info.phone})` : info.phone}`);
  }
  lines.push(`🕐 *Time:* ${timeStr}`, `📅 *Date:* ${date}`);
  if (typeof info.inGroup === "boolean") {
    lines.push(`📍 *Chat:* ${info.inGroup ? `Group${info.groupName ? ` (${info.groupName})` : ""}` : "DM"}`);
  }
  if (info.trigger) lines.push(`🔑 *Trigger:* ${info.trigger}`);
  if (info.caption) lines.push(`💬 *Caption:* "${info.caption}"`);
  lines.push("", "> 👁️ *AA MD Bot*");
  return lines.join("\n");
}

function infoFromStored(stored, extra = {}) {
  return {
    phone: stored.phone,
    name: stored.senderName,
    inGroup: stored.inGroup,
    groupName: stored.groupName,
    caption: stored.caption,
    ...extra,
  };
}

async function sendStored(sock, to, stored, cap) {
  const once = async () => {
    if (stored.isAudio) {
      await sock.sendMessage(to, { text: cap });
      await sock.sendMessage(to, { audio: stored.buf, mimetype: stored.mime, ptt: !!stored.ptt });
    } else if (stored.isVid) {
      await sock.sendMessage(to, { video: stored.buf, caption: cap, mimetype: stored.mime });
    } else {
      await sock.sendMessage(to, { image: stored.buf, caption: cap, mimetype: stored.mime });
    }
  };
  try {
    await once();
    return true;
  } catch (e1) {
    await sleep(800);
    try {
      await once();
      return true;
    } catch (e2) {
      logger.error({ err: e2.message, to }, "❌ ViewOnce send failed after retry");
      return false;
    }
  }
}

// ── Main Listener (Auto-Reveal) ──────────────────────────────────────────────
export async function handleViewOnceMessage(msg, sock, sessionId) {
  if (!msg?.message || !msg?.key?.id) return;
  if (msg.key.fromMe) return; // never store/reveal our own view-once

  const msgId = msg.key.id;
  if (processed.has(msgId) || inflight.has(msgId)) return;

  const extracted = findMedia(msg.message, true);
  if (!extracted) return;

  inflight.add(msgId);
  try {
    const { mediaMsg, isVid, isAudio, mime } = extracted;

    const size = Number(mediaMsg.fileLength || 0);
    if (size && size > MAX_ITEM_BYTES) {
      logger.warn({ size }, "ViewOnce media too large, skipped");
      processed.add(msgId);
      return;
    }

    let buf;
    try {
      buf = await downloadBuffer(mediaMsg, mediaType(isVid, isAudio));
    } catch (e) {
      logger.warn({ err: e.message }, "ViewOnce media download failed");
      return; // not marked processed -> a re-delivery can retry
    }

    processed.add(msgId);
    if (processed.size > PROCESSED_MAX) processed.delete(processed.values().next().value);

    const chatJid = msg.key.remoteJid;
    const inGroup = !!chatJid?.endsWith("@g.us");
    const senderJid = resolveSender(msg.key);
    const num = senderJid.includes("@lid") ? null : getPhoneNum(senderJid);
    const phone = num ? formatPhone(num) : `LID:${getPhoneNum(senderJid) || "unknown"}`;
    const senderName =
      msg.pushName || sock.contacts?.[senderJid]?.name || sock.contacts?.[senderJid]?.notify || phone;

    const entry = {
      buf,
      mime,
      isVid,
      isAudio,
      ptt: !!mediaMsg.ptt,
      num,
      phone,
      inGroup,
      caption: mediaMsg.caption || "",
      chatJid,
      senderJid,
      senderName,
      groupName: null,
      timestamp: Date.now(),
    };
    storeAdd(msgId, entry);

    if (!isAntiVOActive(sessionId, chatJid, inGroup)) return;

    const selfJid = getSelfJid(sock, sessionId);
    if (!selfJid) {
      logger.warn({ sessionId }, "⚠️ Auto-reveal active but selfJid could not be resolved");
      return;
    }

    if (inGroup) entry.groupName = await getGroupName(sock, chatJid);

    const cap = buildCaption("View-Once Auto-Saved", infoFromStored(entry));
    const ok = await sendStored(sock, selfJid, entry, cap);
    if (ok) logger.info({ sessionId, selfJid }, "✅ ViewOnce auto-revealed to self-chat");
  } catch (e) {
    logger.warn({ err: e.message }, "ViewOnce main handler error");
  } finally {
    inflight.delete(msgId);
  }
}

// ── Reply Reveal (reply to view-once with emoji / keyword) ───────────────────
export async function handleReplyReveal(msg, sock, sessionId) {
  try {
    if (!msg?.key?.fromMe) return;

    const msgText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    if (!msgText) return;

    const voKeyword = safe(() => db.settings?.getValue("voKeyword"));
    const prefix = safe(() => db.settings?.getValue("prefix")) || ".";

    const textBody = (msgText.startsWith(prefix) ? msgText.slice(prefix.length) : msgText).trim();

    const hasKeyword = !!(
      voKeyword &&
      typeof voKeyword === "string" &&
      msgText.toLowerCase().includes(voKeyword.toLowerCase())
    );
    // emoji trigger only when the message is ONLY emoji(s) -> no false triggers on normal chat
    const isEmojiTrigger = isOnlyEmoji(textBody) && hasConfiguredVvEmoji(textBody);
    if (!hasKeyword && !isEmojiTrigger) return;

    const ctxInfo = extractContextInfo(msg.message);
    const stanzaId = ctxInfo?.stanzaId || ctxInfo?.quotedStanzaId || null;
    const quotedMsg = ctxInfo?.quotedMessage || null;
    if (!stanzaId && !quotedMsg) return;

    if (!claim(`reply:${stanzaId || msg.key.id}`)) return;

    const selfJid = getSelfJid(sock, sessionId);
    if (!selfJid) return;

    const trigger = isEmojiTrigger ? `emoji (${textBody})` : `keyword (${voKeyword})`;

    // 1) fast path: already in memory
    let stored = stanzaId ? viewOnceStore.get(stanzaId) : null;

    // 2) direct download from the quoted message
    if (!stored && quotedMsg) {
      const ex = findMedia(quotedMsg, false);
      if (ex) {
        try {
          const buf = await downloadBuffer(ex.mediaMsg, mediaType(ex.isVid, ex.isAudio), 2);
          stored = { buf, mime: ex.mime, isVid: ex.isVid, isAudio: ex.isAudio, ptt: !!ex.mediaMsg.ptt };
        } catch {}
      }
    }

    // 3) wait a little - the original may still be downloading
    if (!stored && stanzaId) stored = await waitForStored(stanzaId);
    if (!stored) return;

    const cap = buildCaption("View-Once Revealed", infoFromStored(stored, { trigger }));
    await sendStored(sock, selfJid, stored, cap);
  } catch (e) {
    logger.warn({ err: e.message }, "handleReplyReveal error");
  }
}

// ── Manual Reveal (!reveal <msgId>) ──────────────────────────────────────────
export async function handleManualReveal(msgId, sock, chatJid) {
  try {
    if (!msgId || !chatJid) return;
    const stored = viewOnceStore.get(msgId);
    if (!stored) {
      await sock.sendMessage(chatJid, { text: `⚠️ No stored view-once media found for ID: ${msgId}` }).catch(() => {});
      return;
    }
    const cap = buildCaption("View-Once Revealed (Manual)", infoFromStored(stored));
    await sendStored(sock, chatJid, stored, cap);
  } catch (e) {
    logger.warn({ err: e.message }, "handleManualReveal error");
  }
}

// ── Reaction Reveal (owner reacts with a saved vv emoji) ─────────────────────
export async function handleReactionReveal(msg, sock, sessionId) {
  try {
    const reaction = msg?.message?.reactionMessage;
    if (!reaction) return;

    // only the owner's own reactions (fixed: no longer fires when others react to our messages)
    if (!msg?.key?.fromMe) return;

    const emojiText = reaction.text || "";
    if (!emojiText || !hasConfiguredVvEmoji(emojiText)) return;

    const stanzaId = reaction.key?.id;
    if (!stanzaId) return;
    if (!claim(`react:${stanzaId}`)) return;

    const stored = viewOnceStore.get(stanzaId) || (await waitForStored(stanzaId));
    if (!stored) return;

    const selfJid = getSelfJid(sock, sessionId);
    if (!selfJid) return;

    const cap = buildCaption(
      "View-Once Revealed (Reaction)",
      infoFromStored(stored, { trigger: `emoji (${emojiText})` })
    );
    await sendStored(sock, selfJid, stored, cap);
  } catch (e) {
    logger.warn({ err: e.message }, "handleReactionReveal error");
  }
}

// ── Reveal By Reply (.good / .reveal commands) → boolean ─────────────────────
export async function handleRevealByReply(msg, sock, sessionId) {
  try {
    const ctxInfo = extractContextInfo(msg?.message);
    const stanzaId = ctxInfo?.stanzaId || ctxInfo?.quotedStanzaId || null;
    if (!stanzaId) return false;

    const stored = viewOnceStore.get(stanzaId) || (await waitForStored(stanzaId, 4));
    if (!stored) return false;

    const selfJid = getSelfJid(sock, sessionId || msg?.key?.remoteJid);
    if (!selfJid) return false;

    const cap = buildCaption("View-Once Revealed", infoFromStored(stored));
    return await sendStored(sock, selfJid, stored, cap);
  } catch (e) {
    logger.warn({ err: e.message }, "handleRevealByReply error");
    return false;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function initViewOnce() {
  if (cleanupTimer) return; // prevent duplicate intervals on reconnect
  cleanupTimer = setInterval(cleanViewOnceStore, 60_000);
  cleanupTimer.unref?.();
  logger.info("👁️ ViewOnce Engine v2 initialized");
}
