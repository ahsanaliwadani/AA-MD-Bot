// ============================================
// AA MD Bot — Broadcast to All Connected Numbers
// Sends a message (text or image) to every connected
// number's own self-chat (You). Never sent to groups.
//
// Usage:
//   .broadcast <text>                       — text message
//   Send/reply image + .broadcast <caption> — image + caption
// ============================================

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { sessions } from '../../lib/sessionManager.js';

const FOOTER = '\n\n> 🤖 *AA MD Bot* | 👨‍💻 *Ahsan Ali Wadani*';

export default {
  command: 'broadcast',
  alias: ['bc', 'bcall', 'broadcastall'],
  description: 'Broadcast text or image to all connected numbers (self-chat only)',
  category: 'owner',
  ownerOnly: true,

  async execute({ text, msg, sock, reply, react }) {
    const m = msg.message;

    // ── Detect image: current message OR quoted message ──────────────────────
    const quotedMsg  = m?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg     = m?.imageMessage || quotedMsg?.imageMessage || null;
    const hasImage   = !!imgMsg;
    const captionText = text?.trim() || '';

    if (!hasImage && !captionText) {
      return reply(
        `📢 *Broadcast*\n\n` +
        `Sends a message to the *self-chat (You)* of every connected WhatsApp number.\n\n` +
        `*Text only:*\n` +
        `  _.broadcast Hello everyone!_\n\n` +
        `*With image:*\n` +
        `  Send or reply to an image with _.broadcast <caption>_\n\n` +
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
          ? msg
          : { message: { imageMessage: quotedMsg.imageMessage }, key: msg.key };
        imgBuf  = await downloadMediaMessage(srcMsg, 'buffer', {}, {
          reuploadRequest: sock.updateMediaMessage,
        });
        imgMime = imgMsg.mimetype || 'image/jpeg';
        if (!imgBuf || imgBuf.length < 500) imgBuf = null;
      } catch {
        imgBuf = null;
      }
    }

    const header = `📢 *Broadcast*`;

    let sent = 0, failed = 0;

    for (const { sock: s, ownJid } of connected) {
      try {
        if (imgBuf) {
          const caption = captionText
            ? `${header}\n\n${captionText}${FOOTER}`
            : `${header}${FOOTER}`;
          await s.sendMessage(ownJid, {
            image: imgBuf,
            mimetype: imgMime,
            caption,
          });
        } else {
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
      `✅ *Broadcast Complete*\n\n` +
      `${hasImage ? '🖼️ Image' : '📝 Text'} broadcast\n` +
      `📨 Delivered to self-chat: *${sent}* number(s)\n` +
      (failed ? `❌ Failed: *${failed}*\n` : '') +
      FOOTER
    );
  },
};
