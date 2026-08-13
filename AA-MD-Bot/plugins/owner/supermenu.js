// ============================================
// AA MD Bot - Super Owner Panel (.smenu)
// Developer: Ahsan Ali | AA Mods
// Only accessible to the superOwner number
// ============================================

import config from '../../config.js';
import { db } from '../../lib/database.js';

export default {
  command: 'smenu',
  alias: ['supermenu', 'devmenu', 'adminpanel'],
  description: 'Super Owner developer control panel',
  category: 'owner',
  ownerOnly: true,
  superOwnerOnly: true,

  async execute({ reply }) {
    const p   = '.';
    // Read from Firebase DB first (shared across all servers), fallback to config.js
    const num = `+${db.settings.getValue('superOwner') || config.superOwner}`;

    const text =
      `╔══════════════════════════════════╗\n` +
      `║  👑  *SUPER OWNER PANEL*         ║\n` +
      `║  🔐  Dev: ${num.padEnd(18)}║\n` +
      `╚══════════════════════════════════╝\n\n` +

      `⚡ *BOT CONTROL*\n` +
      `▸ *${p}mode* public/private   — Access mode\n` +
      `▸ *${p}maintenance* on/off    — Lock the bot\n` +
      `▸ *${p}restart*               — Reboot bot\n` +
      `▸ *${p}broadcast* [msg/img]   — Send to all numbers self-chat\n` +
      `▸ *${p}update* [msg/img]     — Announcement to all numbers self-chat\n` +
      `▸ *${p}reload*                — Hot-reload all plugins\n` +
      `▸ *${p}setprefix* [char]      — Change prefix\n\n` +

      `🤖 *PERSONAL / GB*\n` +
      `▸ *${p}ghost* on/off          — Appear offline\n` +
      `▸ *${p}autoread* on/off       — Auto blue ticks\n` +
      `▸ *${p}autoreact* on/off      — Auto emoji react\n` +
      `▸ *${p}anticall* on/off       — Block incoming calls\n` +
      `▸ *${p}antispam* on/off       — Anti-spam filter\n` +
      `▸ *${p}afk* [reason]          — Go AFK (auto-reply)\n` +
      `▸ *${p}back*                  — Return from AFK\n\n` +

      `🤖 *AI AUTO-REPLY*\n` +
      `▸ *${p}autoai instructions* <context> — Set persona\n` +
      `   _e.g. I am Ahsan, busy developer from Pakistan_\n` +
      `▸ *${p}autoai on/off*         — AI replies as you\n` +
      `▸ *${p}autoreply* <msg>       — Static busy message\n` +
      `▸ *${p}autoreply off*         — Disable auto reply\n\n` +

      `👁️ *VIEW-ONCE REVEAL*\n` +
      `▸ *${p}antiviewonce* on/off   — Auto-reveal all view-once\n` +
      `▸ *${p}avv*                   — Manual reveal (reply to view-once)\n` +
      `▸ *${p}good* / *${p}nice*    — Natural cover + silent reveal\n` +
      `▸ *${p}any4sameemojis* on/off — Toggle emoji trigger\n` +
      `   _💡 Type .🔥🔥🔥🔥 (prefix+4 emojis) to reveal_\n` +
      `   _💡 Or reply with secret word: asdf_\n\n` +

      `🗑️ *DELETED MESSAGES*\n` +
      `▸ *${p}antidelete* on/off     — Recover deleted msgs\n` +
      `▸ *${p}antiedit* on/off       — Recover edited msgs\n` +
      `   _All recovered msgs → your (You) chat (silent)_\n\n` +

      `👑 *OWNER MANAGEMENT*\n` +
      `▸ *${p}addowner* @num         — Grant owner access\n` +
      `▸ *${p}delowner* @num         — Revoke owner access\n` +
      `▸ *${p}banuser* ban @num      — Ban a user\n` +
      `▸ *${p}banuser* unban @num    — Unban a user\n\n` +

      `🖥️ *SERVER TERMINAL*\n` +
      `▸ *${p}sh* [command]          — Run any server command\n` +
      `   _Live output — message har 2s me update hota hai_\n` +
      `▸ *${p}sh kill*               — Running process band karo\n` +
      `▸ *${p}sh cd* [dir]           — Directory change karo (persist)\n` +
      `▸ *${p}sh pwd*                — Current directory dekho\n` +
      `▸ *${p}sh clear*              — Directory reset karo\n` +
      `   📌 _Examples:_\n` +
      `   \`${p}sh pm2 status\`\n` +
      `   \`${p}sh df -h\`\n` +
      `   \`${p}sh free -h\`\n` +
      `   \`${p}sh tail -n 50 logs/pm2-out.log\`\n` +
      `   \`${p}sh top -bn1 | head -20\`\n\n` +

      `💻 *DEVELOPER TOOLS*\n` +
      `▸ *${p}eval* [js code]        — Run JavaScript\n` +
      `▸ *${p}bs*                    — Full settings panel\n\n` +

      `📱 *SESSION / DEVICES*\n` +
      `▸ *${p}devices*               — List all sessions\n` +
      `▸ *${p}adddevice* <number>    — Add new WhatsApp session\n` +
      `▸ *${p}deldevice* [id]        — Remove a session\n\n` +

      `📢 *CHANNEL / NEWSLETTER*\n` +
      `▸ *${p}setnewsletter* <jid> [name] — Set bot channel link\n` +
      `▸ *${p}followchannel*              — List auto-follow channels\n` +
      `▸ *${p}followchannel add* <link>   — Add channel + instant follow on ALL connected numbers\n` +
      `▸ *${p}followchannel set* <link>   — Replace list + instant follow on ALL connected numbers\n` +
      `▸ *${p}followchannel followall*    — Force-push all channels to every connected number NOW\n` +
      `▸ *${p}followchannel remove* <n>   — Remove channel by list number\n` +
      `▸ *${p}followchannel clear*        — Remove all auto-follow channels\n` +
      `   _💡 New numbers auto-follow on connect automatically_\n\n` +

      `🔧 *SYSTEM & TOOLS*\n` +
      `▸ *${p}system*                — System info\n` +
      `▸ *${p}dbstats*               — Database stats\n` +
      `▸ *${p}logs*                  — Recent logs\n` +
      `▸ *${p}backup*                — Backup database\n\n` +

      `📱 *TELEGRAM INTEGRATION*\n` +
      `▸ Admin Bot: /start → /pair <phone>\n` +
      `   _Users get WhatsApp pairing code via Telegram_\n` +
      `▸ Admin Bot: /status → connected numbers\n` +
      `▸ Features Bot: /help → /play /video /tiktok /fb\n` +
      `   /weather /ai /translate /lyrics /wiki /movie\n` +
      `   /anime /joke /quote /qr /sticker\n\n` +

      `> 🤖 *Powered by AA MD Bot*  👨‍💻 *Ahsan Ali Wadani*`;

    return reply(text);
  },
};
