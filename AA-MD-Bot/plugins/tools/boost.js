// AA MD Bot — Social Media View Booster
// DavidCyrilTech APIs for IG / TikTok / YouTube
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function runBoost(endpoint, url) {
  const { data } = await axios.get(`${DC}${endpoint}`, {
    params: { url },
    headers: { 'User-Agent': UA },
    timeout: 25000,
  });
  return data;
}

function boostPlugin({ command, alias, description, endpoint, emoji, label, regex, example }) {
  return {
    command, alias, description,
    category: 'tools',
    async execute({ text, reply, react, prefix }) {
      const url = (text || '').trim();
      if (!url || !regex.test(url)) {
        return reply(
          `${emoji} *${label} View Booster*\n\n` +
          `*Usage:* ${prefix}${command} <URL>\n` +
          `*Example:* ${prefix}${command} ${example}\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      }
      await react('⏳');
      try {
        const data = await runBoost(endpoint, url);
        if (data?.success === false) throw new Error(data?.message || data?.error || 'Boost failed');
        const result = data?.views || data?.count || data?.boosted || data?.message || 'Request sent ✅';
        await react('✅');
        reply(
          `${emoji} *${label} Boost Sent!*\n\n` +
          `🔗 ${url}\n` +
          `📊 *Result:* ${result}\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      } catch (e) {
        await react('❌');
        reply(`❌ *${label} Boost Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
      }
    },
  };
}

const igboost = boostPlugin({
  command: 'igboost',
  alias: ['instagramboost', 'igviews', 'boostig'],
  description: 'Boost Instagram video/reel views',
  endpoint: '/api/instagram/boost3',
  emoji: '📸', label: 'Instagram',
  regex: /https?:\/\/(www\.)?instagram\.com\/[^\s]+/i,
  example: 'https://www.instagram.com/p/CuK8P2rNvBJ/',
});

const tiktokboost = boostPlugin({
  command: 'tiktokboost',
  alias: ['ttboost', 'tiktokviews', 'boosttt'],
  description: 'Boost TikTok video views',
  endpoint: '/api/tiktok/boost4',
  emoji: '🎵', label: 'TikTok',
  regex: /https?:\/\/(www\.)?tiktok\.com\/[^\s]+/i,
  example: 'https://www.tiktok.com/@khaby.lame/video/7022309038815528198',
});

const ytboost = boostPlugin({
  command: 'ytboost',
  alias: ['youtubeviews', 'youtubeboost', 'boostyt'],
  description: 'Boost YouTube video views',
  endpoint: '/api/youtube/boost',
  emoji: '▶️', label: 'YouTube',
  regex: /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+/i,
  example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
});

const PLATFORMS = { instagram: igboost, tiktok: tiktokboost, youtube: ytboost };
function detectPlatform(url) {
  for (const [, p] of Object.entries(PLATFORMS)) {
    if (p.alias?.includes('boostig') && /instagram/i.test(url)) return p;
    if (p.alias?.includes('boosttt') && /tiktok/i.test(url)) return p;
    if (p.alias?.includes('boostyt') && /youtube|youtu\.be/i.test(url)) return p;
  }
  return null;
}

const universalBoost = {
  command: 'boost',
  alias: ['viewboost', 'boostviews'],
  description: 'Boost views on Instagram, TikTok, or YouTube (auto-detect)',
  category: 'tools',
  async execute({ text, reply, react, prefix }) {
    const url = (text || '').trim();
    if (!url) {
      return reply(
        `🚀 *Social Media View Booster*\n\n` +
        `*Usage:* ${prefix}boost <URL>\n\n` +
        `*Platforms:*\n` +
        `• ${prefix}igboost <url>       📸 Instagram\n` +
        `• ${prefix}tiktokboost <url>   🎵 TikTok\n` +
        `• ${prefix}ytboost <url>       ▶️ YouTube\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }
    const p = detectPlatform(url);
    if (!p) return reply(`❌ Unsupported URL. Supported: Instagram, TikTok, YouTube\n\n> 🤖 *AA MD Bot*`);
    const endpoint = p.alias?.includes('boostig') ? '/api/instagram/boost3'
                   : p.alias?.includes('boosttt') ? '/api/tiktok/boost4'
                   : '/api/youtube/boost';
    await react('⏳');
    try {
      const data = await runBoost(endpoint, url);
      if (data?.success === false) throw new Error(data?.message || 'Boost failed');
      const result = data?.views || data?.count || data?.message || 'Request sent ✅';
      await react('✅');
      reply(`🚀 *Boost Sent!*\n\n🔗 ${url}\n📊 *Result:* ${result}\n\n> 🤖 *AA MD Bot*`);
    } catch (e) {
      await react('❌');
      reply(`❌ *Boost Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};

export default [igboost, tiktokboost, ytboost, universalBoost];
