// AA MD Bot — Social Media View Booster
// Sends boost requests to DavidCyrilTech APIs
// Supported: Instagram, TikTok, YouTube
// NOTE: These are API-based boost triggers — actual effect depends on the API service.
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const PLATFORMS = {
  instagram: {
    endpoint: '/api/instagram/boost3',
    regex:    /https?:\/\/(www\.)?instagram\.com\/[^\s]+/i,
    emoji:    '📸',
    label:    'Instagram',
    example:  'https://www.instagram.com/p/CuK8P2rNvBJ/',
  },
  tiktok: {
    endpoint: '/api/tiktok/boost4',
    regex:    /https?:\/\/(www\.)?tiktok\.com\/[^\s]+/i,
    emoji:    '🎵',
    label:    'TikTok',
    example:  'https://www.tiktok.com/@khaby.lame/video/7022309038815528198',
  },
  youtube: {
    endpoint: '/api/youtube/boost',
    regex:    /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+/i,
    emoji:    '▶️',
    label:    'YouTube',
    example:  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
};

async function runBoost(platform, url) {
  const { data } = await axios.get(`${DC}${platform.endpoint}`, {
    params: { url },
    headers: { 'User-Agent': UA },
    timeout: 25000,
  });
  return data;
}

function detectPlatform(url) {
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (p.regex.test(url)) return { key, ...p };
  }
  return null;
}

// ── Instagram Boost ───────────────────────────────────────────────────────────
export const igboost = {
  command: 'igboost',
  alias: ['instagramboost', 'igviews', 'boostig'],
  description: 'Boost Instagram video/reel views',
  category: 'tools',
  async execute({ text, reply, react, prefix }) {
    const url = (text || '').trim();
    const p   = PLATFORMS.instagram;
    if (!url || !p.regex.test(url)) {
      return reply(
        `${p.emoji} *Instagram View Booster*\n\n` +
        `*Usage:* ${prefix}igboost <post/reel URL>\n` +
        `*Example:* ${prefix}igboost ${p.example}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }
    await react('⏳');
    try {
      const data = await runBoost(p, url);
      if (data?.success === false) throw new Error(data?.message || data?.error || 'Boost failed');
      const views = data?.views || data?.count || data?.boosted || 'Sent';
      await react('✅');
      reply(
        `${p.emoji} *Instagram Boost Sent!*\n\n` +
        `🔗 ${url}\n` +
        `📊 *Result:* ${views}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (e) {
      await react('❌');
      reply(`❌ *Instagram Boost Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};

// ── TikTok Boost ──────────────────────────────────────────────────────────────
export const tiktokboost = {
  command: 'tiktokboost',
  alias: ['ttboost', 'tiktokviews', 'boosttt'],
  description: 'Boost TikTok video views',
  category: 'tools',
  async execute({ text, reply, react, prefix }) {
    const url = (text || '').trim();
    const p   = PLATFORMS.tiktok;
    if (!url || !p.regex.test(url)) {
      return reply(
        `${p.emoji} *TikTok View Booster*\n\n` +
        `*Usage:* ${prefix}tiktokboost <video URL>\n` +
        `*Example:* ${prefix}tiktokboost ${p.example}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }
    await react('⏳');
    try {
      const data = await runBoost(p, url);
      if (data?.success === false) throw new Error(data?.message || data?.error || 'Boost failed');
      const views = data?.views || data?.count || data?.boosted || 'Sent';
      await react('✅');
      reply(
        `${p.emoji} *TikTok Boost Sent!*\n\n` +
        `🔗 ${url}\n` +
        `📊 *Result:* ${views}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (e) {
      await react('❌');
      reply(`❌ *TikTok Boost Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};

// ── YouTube Boost ─────────────────────────────────────────────────────────────
export const ytboost = {
  command: 'ytboost',
  alias: ['youtubeviews', 'youtubeboost', 'boostyt'],
  description: 'Boost YouTube video views',
  category: 'tools',
  async execute({ text, reply, react, prefix }) {
    const url = (text || '').trim();
    const p   = PLATFORMS.youtube;
    if (!url || !p.regex.test(url)) {
      return reply(
        `${p.emoji} *YouTube View Booster*\n\n` +
        `*Usage:* ${prefix}ytboost <video URL>\n` +
        `*Example:* ${prefix}ytboost ${p.example}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }
    await react('⏳');
    try {
      const data = await runBoost(p, url);
      if (data?.success === false) throw new Error(data?.message || data?.error || 'Boost failed');
      const views = data?.views || data?.count || data?.boosted || 'Sent';
      await react('✅');
      reply(
        `${p.emoji} *YouTube Boost Sent!*\n\n` +
        `🔗 ${url}\n` +
        `📊 *Result:* ${views}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (e) {
      await react('❌');
      reply(`❌ *YouTube Boost Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};

// ── Universal Boost command ───────────────────────────────────────────────────
export default {
  command: 'boost',
  alias: ['viewboost', 'boostviews'],
  description: 'Boost views on Instagram, TikTok, or YouTube (auto-detects platform)',
  category: 'tools',
  async execute({ text, reply, react, prefix }) {
    const url = (text || '').trim();

    if (!url) {
      return reply(
        `🚀 *Social Media View Booster*\n\n` +
        `*Usage:* ${prefix}boost <URL>\n\n` +
        `*Supported Platforms:*\n` +
        `📸 Instagram: ${prefix}igboost <url>\n` +
        `🎵 TikTok:    ${prefix}tiktokboost <url>\n` +
        `▶️ YouTube:   ${prefix}ytboost <url>\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    const platform = detectPlatform(url);
    if (!platform) {
      return reply(
        `❌ *Unsupported URL*\n\nSupported: Instagram, TikTok, YouTube\n\n> 🤖 *AA MD Bot*`
      );
    }

    await react('⏳');
    try {
      const data = await runBoost(platform, url);
      if (data?.success === false) throw new Error(data?.message || data?.error || 'Boost failed');
      const views = data?.views || data?.count || data?.boosted || 'Sent';
      await react('✅');
      reply(
        `${platform.emoji} *${platform.label} Boost Sent!*\n\n` +
        `🔗 ${url}\n` +
        `📊 *Result:* ${views}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (e) {
      await react('❌');
      reply(`❌ *Boost Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
