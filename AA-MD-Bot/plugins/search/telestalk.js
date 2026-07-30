// AA MD Bot — Telegram Profile Stalk
// API: DavidCyrilTech /stalk/telegram?username=durov
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function fmt(n) {
  if (!n && n !== 0) return 'N/A';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default {
  command: 'telestalk',
  alias: ['telegramstalk', 'tgstalk', 'tgsearch', 'telegraminfo', 'tginfo'],
  description: 'Look up a Telegram profile by username',
  category: 'search',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const username = (text || '').replace(/^@/, '').trim().split(/\s+/)[0];

    if (!username) {
      return reply(
        `✈️ *Telegram Profile Lookup*\n\n` +
        `*Usage:* ${prefix}telestalk <username>\n` +
        `*Example:* ${prefix}telestalk durov\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    await react('⏳');

    try {
      const { data } = await axios.get(`${DC}/stalk/telegram`, {
        params: { username },
        headers: { 'User-Agent': UA },
        timeout: 15000,
      });

      // API may return success:true/false or just the data directly
      if (data?.success === false || data?.error) {
        throw new Error(data?.error || data?.message || 'Profile not found');
      }

      const d = data?.result || data?.data || data;

      const name     = d?.name     || d?.first_name || d?.fullname || d?.title || 'N/A';
      const uname    = d?.username || username;
      const bio      = d?.bio      || d?.description || d?.about   || null;
      const type     = d?.type     || d?.account_type || null;
      const verified = d?.is_verified ?? d?.verified ?? false;
      const members  = d?.members  || d?.subscribers || d?.member_count || null;
      const avatar   = d?.photo    || d?.avatar       || d?.profile_pic  || d?.pp || null;

      let out =
        `✈️ *Telegram Profile*\n` +
        `${'─'.repeat(28)}\n\n` +
        `👤 *Name:* ${name}\n` +
        `🔖 *Username:* @${uname}\n`;

      if (type)     out += `🏷️ *Type:* ${type}\n`;
      if (verified) out += `✅ *Verified*\n`;
      if (bio)      out += `\n📝 *Bio:* ${bio}\n`;
      if (members)  out += `\n👥 *Members/Subscribers:* ${fmt(members)}\n`;

      out +=
        `\n🔗 https://t.me/${uname}\n\n` +
        `> 🤖 *AA MD Bot*`;

      if (avatar) {
        await sock.sendMessage(jid, {
          image: { url: avatar },
          caption: out,
        }, { quoted: msg }).catch(() => reply(out));
      } else {
        await reply(out);
      }

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(
        `❌ *Telegram Lookup Failed*\n\n` +
        `Couldn't find *@${username}*.\n\n` +
        `${e.message}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }
  },
};
