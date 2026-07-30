// AA MD Bot — Snapchat Profile Lookup
// Uses: DavidCyrilTech /stalk/snapchat
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';

export default {
  command: 'scstalk',
  alias: ['snapchatstalk', 'snapstalk', 'scinfo', 'snapchat', 'snapinfo'],
  description: 'Look up a Snapchat profile — bio, snapcode preview',
  category: 'search',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const username = (text || '').replace(/^@/, '').trim().split(/\s+/)[0];
    if (!username) return reply(
      `👻 *Snapchat Profile Lookup*\n\n` +
      `*Usage:* ${prefix}scstalk <username>\n` +
      `*Example:* ${prefix}scstalk djkhaled\n\n` +
      `> 🤖 *AA MD Bot*`
    );

    await react('⏳');
    try {
      const { data } = await axios.get(`${DC}/stalk/snapchat`, {
        params: { username },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      if (!data?.success) throw new Error(data?.error || 'Profile not found');

      const d = data;
      const displayName = d.name && d.name.trim() ? d.name : d.username;
      let text_ =
        `👻 *Snapchat Profile*\n` +
        `${'─'.repeat(28)}\n\n` +
        `👤 *Name:* ${displayName}\n` +
        `🔖 *Username:* ${d.username}\n`;

      const bio = (d.bio || '').replace(`${displayName} is on Snapchat!`, '').trim();
      if (bio) text_ += `📝 *Bio:* ${bio}\n`;

      if (d.url) text_ += `\n🔗 ${d.url}\n`;
      text_ += `\n> 👻 *AA MD Bot*`;

      if (d.image) {
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
      reply(`❌ *Snapchat Lookup Failed*\n\nCouldn't find *${username}*.\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
