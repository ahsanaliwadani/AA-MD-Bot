// ============================================
// AA MD Bot - XVideos Search & Download
// Developer: Ahsan Ali | AA Mods
//
// Commands:
//   .xv <search>    — search & send video
//   .xvideos <search>
//   .xvid <search>
//
// Note: nsfw mode must be ON in group
// ============================================

import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';

// ── Search xvideos and return first video page URL ────────────────────────────
async function searchXvideos(query) {
  const url = `https://www.xvideos.com/?k=${encodeURIComponent(query)}&sort=new`;
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.xvideos.com/' },
    timeout: 20000,
  });

  const $ = cheerio.load(data);
  let firstHref = null;

  // Try multiple selectors — site structure can vary
  $('div.thumb-block a[href^="/video"]').each((_, el) => {
    if (!firstHref) firstHref = $(el).attr('href');
  });

  if (!firstHref) {
    $('a[href^="/video"]').each((_, el) => {
      if (!firstHref) {
        const href = $(el).attr('href');
        if (href && /^\/video\d+/.test(href)) firstHref = href;
      }
    });
  }

  if (!firstHref) throw new Error('No results found');
  return `https://www.xvideos.com${firstHref}`;
}

// ── Scrape video page for MP4 URL, title, thumb ───────────────────────────────
async function scrapeVideoPage(videoPageUrl) {
  const { data: html } = await axios.get(videoPageUrl, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.xvideos.com/',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 20000,
  });

  const highUrl = /html5player\.setVideoUrlHigh\('([^']+)'\)/.exec(html)?.[1];
  const lowUrl  = /html5player\.setVideoUrlLow\('([^']+)'\)/.exec(html)?.[1];
  const thumb   = /html5player\.setThumbUrl169\('([^']+)'\)/.exec(html)?.[1]
               || /html5player\.setThumbUrl\('([^']+)'\)/.exec(html)?.[1];
  const title   = /html5player\.setVideoTitle\('([^']+)'\)/.exec(html)?.[1]
               || 'Untitled';
  const views   = /html5player\.setVideoViews\((\d+)\)/.exec(html)?.[1];
  const duration = /html5player\.setVideoDuration\((\d+)\)/.exec(html)?.[1];

  const mp4 = highUrl || lowUrl;
  if (!mp4) throw new Error('No MP4 stream found on this page');

  return { mp4, thumb: thumb || null, title, views, duration, pageUrl: videoPageUrl };
}

// ── Format duration seconds → mm:ss ──────────────────────────────────────────
function fmtDur(secs) {
  if (!secs) return '—';
  const s = parseInt(secs);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'xv',
  alias: ['xvideos', 'xvid', 'xvideo'],
  description: 'Search & download a video from XVideos 🔞',
  category: 'fun',
  usage: '.xv <search term>',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    const query = (text || '').trim();

    // ── No query: show usage ──────────────────────────────────────────────────
    if (!query) {
      return reply(
        `🔞 *XVideos Downloader*\n\n` +
        `_Search & send adult videos directly to chat_\n\n` +
        `*Usage:*\n` +
        `▸ *${prefix}xv* <search term>\n\n` +
        `*Examples:*\n` +
        `▸ ${prefix}xv asian\n` +
        `▸ ${prefix}xv romantic\n` +
        `▸ ${prefix}xvideos cute girl\n\n` +
        `⚠️ _Adult content — 18+ only_${FOOTER}`
      );
    }

    if (query.length > 150) {
      return reply(`❌ Search too long. Keep it under 150 characters.${FOOTER}`);
    }

    await react('🔞');

    let statusMsg;
    try {
      // Send searching indicator
      try {
        statusMsg = await sock.sendMessage(jid, {
          text: `🔍 *Searching XVideos...*\n\n📝 Query: _${query}_\n\n⏳ _Please wait..._${FOOTER}`,
        }, { quoted: msg });
      } catch { /* ignore */ }

      // Step 1: Search
      const videoPageUrl = await searchXvideos(query);

      try {
        await sock.sendMessage(jid, {
          edit: statusMsg?.key,
          text: `✅ *Found a result!*\n\n📝 Query: _${query}_\n\n🔗 _Fetching video stream..._${FOOTER}`,
        });
      } catch { /* ignore */ }

      // Step 2: Scrape video page
      const { mp4, thumb, title, views, duration, pageUrl } = await scrapeVideoPage(videoPageUrl);

      try {
        await sock.sendMessage(jid, {
          edit: statusMsg?.key,
          text: `📥 *Sending video...*\n\n🎬 _${title.slice(0, 60)}_\n\n⌛ _Almost done..._${FOOTER}`,
        });
      } catch { /* ignore */ }

      // Step 3: Send video
      const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 60).trim() || 'xvideos';
      const viewsFmt = views ? `${parseInt(views).toLocaleString()} views` : '';
      const durFmt   = fmtDur(duration);

      const caption =
        `🔞 *XVideos*\n\n` +
        `🎬 *${title.slice(0, 100)}*\n\n` +
        (viewsFmt ? `👁️ ${viewsFmt}   ⏱️ ${durFmt}\n` : '') +
        `🔗 ${pageUrl}${FOOTER}`;

      await sock.sendMessage(jid, {
        video: { url: mp4 },
        mimetype: 'video/mp4',
        fileName: `${cleanTitle}.mp4`,
        caption,
        contextInfo: thumb ? {
          externalAdReply: {
            title: title.length > 80 ? title.substring(0, 77) + '...' : title,
            body: viewsFmt || 'XVideos',
            thumbnailUrl: thumb,
            sourceUrl: pageUrl,
            mediaType: 2,
            renderLargerThumbnail: true,
          },
        } : undefined,
      }, { quoted: msg });

      // Edit status to success
      try {
        await sock.sendMessage(jid, {
          edit: statusMsg?.key,
          text: `✅ *Video Sent!*\n\n🎬 _${title.slice(0, 60)}_${FOOTER}`,
        });
      } catch { /* ignore */ }

      await react('✅');

    } catch (err) {
      console.error('[xv.js] Error:', err.message);

      try {
        await sock.sendMessage(jid, {
          edit: statusMsg?.key,
          text: `❌ *Failed*\n\n_${err.message?.slice(0, 100) || 'Unknown error'}_${FOOTER}`,
        });
      } catch { /* ignore */ }

      await react('❌');
      await reply(
        `❌ *XVideos search failed*\n\n` +
        `📝 Query: _${query}_\n\n` +
        `💡 *Tips:*\n` +
        `▸ Try simpler keywords (1-2 words)\n` +
        `▸ Use English keywords\n` +
        `▸ Try again in a few seconds\n` +
        `▸ The site may be temporarily blocked${FOOTER}`
      );
    }
  },
};
