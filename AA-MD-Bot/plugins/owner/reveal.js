// ============================================
// AA MD Bot - View-Once Reveal Plugin
// Developer: Ahsan Ali | AA Mods
//
// Strategy:
//  1. PRIMARY  — download directly from the quoted message's media keys
//               (works when media key is still fresh on WhatsApp servers)
//  2. FALLBACK — handleRevealByReply from antiViewOnce (recursive contextInfo
//               walker, checks in-memory store + disk index by stanzaId)
//  3. ARG MODE — .reveal <msgId> looks up the store/disk by message ID
// ============================================

import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import {
  viewOnceStore, handleManualReveal, handleRevealByReply,
} from '../../lib/antiViewOnce.js';
import moment from 'moment-timezone';
import config from '../../config.js';

// ── Extract any media from a quotedMessage object ─────────────────────────────
// Unwraps all known viewOnce wrappers and returns { mediaMsg, isVid, mime, isAudio }
function extractQuotedMedia(quotedMsg) {
  if (!quotedMsg) return null;

  // Walk common wrappers: viewOnceMessageV2, viewOnceMessage, ephemeralMessage
  const inner =
    quotedMsg?.viewOnceMessageV2?.message ||
    quotedMsg?.viewOnceMessageV2Extension?.message ||
    quotedMsg?.viewOnceMessage?.message ||
    quotedMsg?.ephemeralMessage?.message ||
    quotedMsg;

  if (inner?.imageMessage) return { mediaMsg: inner.imageMessage, isVid: false, mime: inner.imageMessage.mimetype || 'image/jpeg' };
  if (inner?.videoMessage) return { mediaMsg: inner.videoMessage, isVid: true,  mime: inner.videoMessage.mimetype || 'video/mp4'  };
  if (inner?.audioMessage) return { mediaMsg: inner.audioMessage, isVid: false, mime: inner.audioMessage.mimetype || 'audio/mp4', isAudio: true };

  // Direct fields (when WhatsApp strips the wrapper)
  if (quotedMsg?.imageMessage) return { mediaMsg: quotedMsg.imageMessage, isVid: false, mime: quotedMsg.imageMessage.mimetype || 'image/jpeg' };
  if (quotedMsg?.videoMessage) return { mediaMsg: quotedMsg.videoMessage, isVid: true,  mime: quotedMsg.videoMessage.mimetype || 'video/mp4'  };
  if (quotedMsg?.audioMessage) return { mediaMsg: quotedMsg.audioMessage, isVid: false, mime: quotedMsg.audioMessage.mimetype || 'audio/mp4', isAudio: true };

  return null;
}

// ── Download buffer from a Baileys media message ──────────────────────────────
async function dlBuf(mediaMsg, type) {
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default {
  command: 'avv',
  alias: ['vv', 'reveal', 'vo', 'viewonce', 'openvv', 'showvo'],
  description: 'Reveal a view-once — reply to it, or pass a message ID',
  category: 'owner',
  ownerOnly: true,

  async execute({ sock, msg, jid, args, reply, react }) {

    const tz      = config.timezone || 'Asia/Karachi';
    const date    = moment().tz(tz).format('DD/MM/YYYY');
    const timeStr = moment().tz(tz).format('HH:mm:ss');

    const selfNum = sock.user?.id?.split('@')[0]?.split(':')[0];
    const selfJid = selfNum ? `${selfNum}@s.whatsapp.net` : jid;

    // ══ MODE A: .reveal <msgId> — explicit ID lookup ═══════════════════════════
    if (args[0]) {
      const msgId = args[0].trim();
      await handleManualReveal(msgId, sock, selfJid); return;

      

    // ══ MODE B: Reply to a view-once ══════════════════════════════════════════
    const msgContent = msg.message || {};

    // ── Step 1: Try downloading directly from the quoted message's media keys ──
    // Works when WhatsApp still has the media key available (freshly received).
    const ctxInfoDirect =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.imageMessage?.contextInfo ||
      msgContent?.videoMessage?.contextInfo ||
      msgContent?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
      null;

    const quotedMsg = ctxInfoDirect?.quotedMessage;

    if (quotedMsg) {
      const extracted = extractQuotedMedia(quotedMsg);
      if (extracted) {
        try {
          const type = extracted.isAudio ? 'audio' : (extracted.isVid ? 'video' : 'image');
          const buf  = await dlBuf(extracted.mediaMsg, type);

          if (buf?.length > 0) {
            const cap =
              `🔓 *View-Once Revealed*\n\n` +
              `📅 *Date:* ${date}\n` +
              `⏰ *Time:* ${timeStr}\n` +
              `📁 *Type:* ${extracted.isAudio ? 'AUDIO' : extracted.isVid ? 'VIDEO' : 'IMAGE'}\n\n` +
              `> 👁️ *AA MD Bot*`;

            if (extracted.isAudio) {
              await sock.sendMessage(selfJid, {
                audio: buf, mimetype: extracted.mime,
                ptt: extracted.mediaMsg?.ptt || false,
              }).catch(() => {});
            } else if (extracted.isVid) {
              await sock.sendMessage(selfJid, { video: buf, caption: cap, mimetype: extracted.mime }).catch(() => {});
            } else {
              await sock.sendMessage(selfJid, { image: buf, caption: cap, mimetype: extracted.mime }).catch(() => {});
            }

            return;
          }
        } catch (_) {
          // Direct download failed — fall through to store lookup below
        }
      }
    }

    // ── Step 2: Use handleRevealByReply — recursive contextInfo walker ─────────
    // Checks both in-memory store (30-min TTL) and disk index by stanzaId.
    // Includes a short retry window (up to 3 s) for the race where .reveal is
    // sent quickly and messages.update hasn't delivered the buffer yet.
    try {
      let found = await handleRevealByReply(msg, sock);
      if (!found) {
        // Retry up to 6 × 500 ms = 3 s to handle delayed messages.update delivery
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 500));
          found = await handleRevealByReply(msg, sock);
          if (found) break;
        }
      }
      if (found) {
        return;
      }
    } catch (_) {}

    // ── Nothing worked ─────────────────────────────────────────────────────────
    await react('❌');
    return reply(
      `❌ *View-Once not found*\n\n` +
      `Could not download this view-once.\n\n` +
      `📌 *Reasons this can fail:*\n` +
      `• The bot was not running when the view-once arrived\n` +
      `• The media has expired from WhatsApp's servers\n` +
      `• You are replying to a forwarded copy, not the original\n\n` +
      `💡 *Tip:* Enable *.antiviewonce on* so the bot auto-saves every view-once as it arrives.\n\n` +
      `> 👁️ *AA MD Bot*`
    );
  },
};
