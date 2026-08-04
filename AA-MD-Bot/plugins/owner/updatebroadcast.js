// ============================================
// AA MD Bot — Update Broadcast
// SuperOwner sends an update/announcement message
// that goes to EVERY connected number's own self-chat (You)
// Just like the first-connect confirmation message.
// ============================================

import { sessions } from '../../lib/sessionManager.js';

const FOOTER = '\n\n> 🤖 *AA MD Bot* | 👨‍💻 *Ahsan Ali Wadani*';

export default {
  command: 'update',
  alias: ['sendupdate', 'bcupdate', 'updateall', 'botupdate'],
  description: 'Send an update/announcement to all connected numbers (self-chat)',
  category: 'owner',
  superOwnerOnly: true,
  usage: '.update <your message>',

  async execute({ text, reply, react, config, db }) {
    if (!text) {
      return reply(
        `📢 *Update Broadcast*\n\n` +
        `Sends a message to the *self-chat (You)* of every connected WhatsApp number.\n\n` +
        `*Usage:* .update <message>\n\n` +
        `*Example:*\n` +
        `_.update Bot updated to v3.1! New features: .gbmenu_\n\n` +
        `📌 Only connected (online) sessions receive the message.\n` +
        FOOTER
      );
    }

    await react('⏳');

    // Collect all live connected sessions
    const connected = [];
    for (const [sessionId, sock] of sessions.entries()) {
      if (sock?.ws?.readyState === 1 && sock?.user?.id) {
        // own JID = self-chat (You)
        const ownJid = sock.user.id.replace(/:.*@/, '@');
        const phone  = sock.user.id.split('@')[0].split(':')[0];
        connected.push({ sessionId, sock, ownJid, phone });
      }
    }

    if (!connected.length) {
      await react('❌');
      return reply(`❌ No connected sessions found. All numbers are offline.`);
    }

    const time = new Date().toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi', hour12: true,
    });

    const message =
      `📢 *Update from AA MD Bot*\n` +
      `🕐 ${time}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${text}` +
      FOOTER;

    let sent = 0;
    let failed = 0;

    for (const { sock, ownJid, phone, sessionId } of connected) {
      try {
        await sock.sendMessage(ownJid, { text: message });
        sent++;
        // Small delay to avoid rate-limit
        await new Promise(r => setTimeout(r, 800));
      } catch {
        failed++;
      }
    }

    await react('✅');
    return reply(
      `✅ *Update Sent!*\n\n` +
      `📨 Delivered: *${sent}* number(s)\n` +
      (failed ? `❌ Failed: *${failed}*\n` : '') +
      `\n` +
      connected.map(s => `• +${s.phone} (${s.sessionId})`).join('\n') +
      FOOTER
    );
  },
};
