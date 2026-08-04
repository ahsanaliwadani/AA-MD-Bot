// ============================================
// AA MD Bot — Update Broadcast (SuperOwner only)
// Sends a message (text or image) to every connected
// number's own self-chat (You). Never goes to groups.
//
// Usage:
//   .update <text>                  — text message
//   Send/reply image + .update <caption>  — image + caption
// ============================================

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { sessions } from '../../lib/sessionManager.js';

const FOOTER = '\n\n> 🤖 *AA MD Bot* | 👨‍💻 *Ahsan Ali Wadani*';

export default {
  command: 'update',
  alias: ['sendupdate', 'bcupdate', 'updateall', 'botupdate'],
  description: 'Send update/announcement (text or image) to all connected numbers self-chat',
  category: 'owner',
  superOwnerOnly: true,
  usage: '.update <message>  |  send image with caption .update <caption>',

  async execute({ text, msg, sock, reply, react }) {
    const m = msg.message;

    // ── Detect image: current message OR quoted message ──────────────────────
    const quotedMsg  = m?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg     = m?.imageMessage || quotedMsg?.imageMessage || null;
    const hasImage   = !!imgMsg;
    const captionText = text?.trim() || '';

    if (!hasImage && !captionText) {
      return reply(
        `📢 *Update Broadcast*\n\n` +
        `Sends a message to the *self-chat (You)* of every connected WhatsApp number.\n\n` +
        `*Text only:*\n` +
        `  _.update Bot has been updated! New: .gbmenu_\n\n` +
        `*With image:*\n` +
        `  Send or reply to an image with _.update <caption>_\n\n` +
        `📌 Only connected (online) sessions receive the message.\n` +
        `📌 Never sent to groups — only to your own self-chat on each number.\n` +
        FOOTER
      );
    }

    await react('⏳');

    // ── Collect all live connected sessions ──────────────────────────────────
    const connected = [];
    for (const [sessionId, s] of sessions.entries()) {
      if (s?.ws?.readyState === 1 && s?.user?.id) {
        const ownJid = s.user.id.replace(/:.*@/, '@');
        const phone  = s.user.id.split('@')[0].split(':')[0];
        connected.push({ sessionId, sock: s, ownJid, phone });
      }
    }

    if (!connected.length) {
      await react('❌');
      return reply(`❌ No connected sessions found. All numbers are offline.`);
    }

    // ── Download image buffer once (if image present) ────────────────────────
    let imgBuf  = null;
    let imgMime = 'image/jpeg';
    if (hasImage) {
      try {
        const srcMsg = m?.imageMessage
          ? msg                                                  // image in current msg
          : { message: { imageMessage: quotedMsg.imageMessage }, key: msg.key }; // quoted
        imgBuf  = await downloadMediaMessage(srcMsg, 'buffer', {}, {
          reuploadRequest: sock.updateMediaMessage,
        });
        imgMime = imgMsg.mimetype || 'image/jpeg';
        if (!imgBuf || imgBuf.length < 500) imgBuf = null;
      } catch {
        imgBuf = null;
      }
    }

    const time = new Date().toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi', hour12: true,
    });

    const header =
      `📢 *Update from AA MD Bot*\n` +
      `🕐 ${time}\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    let sent = 0, failed = 0;

    for (const { sock: s, ownJid } of connected) {
      try {
        if (imgBuf) {
          // Image message — caption carries header + text + footer
          const caption = `${header}\n\n${captionText}${FOOTER}`;
          await s.sendMessage(ownJid, {
            image: imgBuf,
            mimetype: imgMime,
            caption,
          });
        } else {
          // Text-only message
          await s.sendMessage(ownJid, {
            text: `${header}\n\n${captionText}${FOOTER}`,
          });
        }
        sent++;
        await new Promise(r => setTimeout(r, 800));
      } catch {
        failed++;
      }
    }

    await react('✅');
    return reply(
      `✅ *Update Sent!*\n\n` +
      `${hasImage ? '🖼️ Image' : '📝 Text'} broadcast\n` +
      `📨 Delivered: *${sent}* number(s)\n` +
      (failed ? `❌ Failed: *${failed}*\n` : '') +
      `\n` +
      connected.map(s => `• +${s.phone} (${s.sessionId})`).join('\n') +
      FOOTER
    );
  },
};
