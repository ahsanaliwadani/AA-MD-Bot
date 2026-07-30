// AA MD Bot — WhatsApp Channel Stalk
// Uses: DavidCyrilTech /stalk/wa?url=<channel_url>
// Response: { title, followers, followersCount, description, image }
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';

/** Normalize input to a full whatsapp.com/channel/... URL */
function normalizeUrl(input) {
  const t = input.trim();
  // Already a full URL
  if (/whatsapp\.com\/channel\//i.test(t)) return t;
  // Invite code only (alphanumeric, 20+ chars typical)
  if (/^[A-Za-z0-9]{15,}$/.test(t)) return `https://whatsapp.com/channel/${t}`;
  return null;
}

function fmt(n) {
  if (!n && n !== 0) return 'N/A';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default {
  command: 'wachannel',
  alias: ['whatsappchannel', 'channelinfo', 'chanstalk', 'channelstalk', 'wachan', 'wastalk'],
  description: 'Look up any WhatsApp Channel by invite link or code',
  category: 'search',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    if (!text?.trim()) return reply(
      `📢 *WhatsApp Channel Lookup*\n\n` +
      `*Usage:*\n` +
      `${prefix}wachannel https://whatsapp.com/channel/<code>\n` +
      `${prefix}wachannel <invite code>\n\n` +
      `*Example:*\n` +
      `${prefix}wachannel 0029Vb8Yk2LL2AU78HliE617\n\n` +
      `> 📢 *AA MD Bot*`
    );

    const channelUrl = normalizeUrl(text.trim());
    if (!channelUrl) return reply(
      `❌ *Invalid input.*\n\n` +
      `Provide a WhatsApp channel link or invite code.\n\n` +
      `*Example:* ${prefix}wachannel 0029Vb8Yk2LL2AU78HliE617\n\n` +
      `> 📢 *AA MD Bot*`
    );

    await react('🔍');
    try {
      const { data } = await axios.get(`${DC}/stalk/wa`, {
        params: { url: channelUrl },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      if (!data?.success) throw new Error(data?.error || data?.message || 'Channel not found');

      const d = data;
      const subCount = d.followersCount ?? null;

      let text_ =
        `📢 *WhatsApp Channel*\n` +
        `${'─'.repeat(28)}\n\n` +
        `📌 *Title:* ${d.title || 'N/A'}\n`;

      if (subCount != null)     text_ += `👥 *Followers:* ${fmt(subCount)}`;
      if (d.followers && !subCount) text_ += `👥 *Followers:* ${d.followers}`;
      if (subCount != null || d.followers) text_ += '\n';

      if (d.description) {
        const clean = d.description.replace(/\s+/g, ' ').trim();
        text_ += `\n📝 *About:* ${clean.slice(0, 250)}${clean.length > 250 ? '…' : ''}\n`;
      }

      text_ += `\n🔗 ${channelUrl}\n\n> 📢 *AA MD Bot*`;

      if (d.image && !d.image.includes('default')) {
        await sock.sendMessage(jid, {
          image: { url: d.image },
          caption: text_,
        }, { quoted: msg }).catch(() => reply(text_));
      } else {
        await reply(text_);
      }

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *Channel Lookup Failed*\n\n${e.message}\n\n> 📢 *AA MD Bot*`);
    }
  },
};
