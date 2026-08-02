// ============================================
// AA MD Bot - Instagram Downloader
// Primary: yt-dlp → fallback: faa API
// ============================================

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { YTDLP, YTDLP_ARGS, getCookiesFlag } from '../../lib/ytdlp.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');

const api = axios.create({ timeout: 25000 });
const IG_RX = /https?:\/\/(www\.)?instagram\.com\/[^\s]+/i;

// ── yt-dlp: download IG post / reel → buffer ─────────────────────────────────
async function ytdlpIG(url) {
  await fs.ensureDir(TEMP);
  // Use a unique request-scoped prefix so concurrent downloads never mix files
  const reqId = `ig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outTpl = path.join(TEMP, `${reqId}_%(autonumber)03d.%(ext)s`);

  const args = [
    YTDLP,
    ...YTDLP_ARGS,
    url,
    '-f', 'best[height<=720][ext=mp4]/best[height<=720]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-o', outTpl,
    '--quiet',
    '--no-warnings',
  ];
  // Attach cookies if available (split the flag properly)
  const ckFlag = getCookiesFlag();
  if (ckFlag) {
    const parts = ckFlag.trim().split(/\s+/);
    args.push(...parts);
  }

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    await execFileAsync(args[0], args.slice(1), { timeout: 120000 });
  } catch {
    // yt-dlp may exit non-zero but still produce files — continue to collect
  }

  // Collect only this request's files using the exact reqId prefix
  const dir = TEMP;
  const ownFiles = (await fs.readdir(dir).catch(() => []))
    .filter(f => f.startsWith(reqId) && (f.endsWith('.mp4') || f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp')))
    .map(f => path.join(dir, f));

  const results = [];
  for (const f of ownFiles) {
    try {
      const buf = await fs.readFile(f);
      if (buf?.length > 10000) {
        results.push({ buf, isVid: f.endsWith('.mp4') });
      }
    } catch {}
    await fs.remove(f).catch(() => {}); // always clean up own files
  }
  return results.length ? results : null;
}

// ── Fallback 1: igram.world API ───────────────────────────────────────────────
async function igramIG(url) {
  const { data: d } = await api.post(
    'https://igram.world/api/convert',
    new URLSearchParams({ url, lang: 'en' }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://igram.world',
        'Referer': 'https://igram.world/',
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 20000,
    }
  );
  const items = d?.url || [];
  if (!items.length) throw new Error('igram: no media found');
  return items;
}

// ── Fallback 2: snapsave.app ──────────────────────────────────────────────────
async function snapsaveIG(url) {
  const { data: html } = await api.post(
    'https://snapsave.app/action.php',
    new URLSearchParams({ url }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://snapsave.app',
        'Referer': 'https://snapsave.app/',
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 20000,
    }
  );
  // Parse video/image URLs from returned HTML
  const urls = [];
  const vidMatches = (html || '').matchAll(/href="(https:\/\/[^"]+\.(mp4|jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const m of vidMatches) {
    const u = m[1].replace(/&amp;/g, '&');
    if (!urls.includes(u)) urls.push(u);
  }
  if (!urls.length) throw new Error('snapsave: no media found');
  return urls;
}

export default {
  command: 'ig',
  alias: ['insta', 'instagram', 'igdl', 'reel'],
  description: 'Download Instagram posts, reels, carousels',
  category: 'download',

  async execute({ text, msg, reply, react, sock, jid, prefix }) {
    let url = text?.trim();
    if (!url) {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (q) url = (q.conversation || q.extendedTextMessage?.text || '').trim();
    }
    const match = url?.match(IG_RX);
    if (!match) return reply(
      `📸 *Instagram Downloader*\n\n` +
      `*Usage:* ${prefix}ig <link>\n` +
      `*Supports:* Posts • Reels • Carousels\n\n` +
      `*Example:* ${prefix}ig https://www.instagram.com/p/xxx\n\n` +
      `> 📸 *AA MD Bot*`
    );

    await react('⏳');
    url = match[0].replace(/[.,!?;]$/, '');

    try {
      // Primary: yt-dlp
      const items = await ytdlpIG(url);
      if (items?.length) {
        for (const { buf, isVid } of items.slice(0, 6)) {
          await sock.sendMessage(jid, isVid
            ? { video: buf, mimetype: 'video/mp4', caption: '📸 *Instagram via AA MD Bot*' }
            : { image: buf, caption: '📸 *Instagram via AA MD Bot*' }, { quoted: msg });
        }
        await react('✅');
        return;
      }
    } catch {}

    // Fallback 1: igram.world
    try {
      const items = await igramIG(url);
      for (const item of items.slice(0, 6)) {
        const mediaUrl = item.url || item;
        const isVid = (item.type === 'video') || String(mediaUrl).includes('.mp4');
        await sock.sendMessage(jid, isVid
          ? { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: '📸 *Instagram via AA MD Bot*' }
          : { image: { url: mediaUrl }, caption: '📸 *Instagram via AA MD Bot*' }, { quoted: msg });
      }
      await react('✅');
      return;
    } catch {}

    // Fallback 2: snapsave.app
    try {
      const urls = await snapsaveIG(url);
      for (const link of urls.slice(0, 6)) {
        const isVid = link.includes('.mp4');
        await sock.sendMessage(jid, isVid
          ? { video: { url: link }, mimetype: 'video/mp4', caption: '📸 *Instagram via AA MD Bot*' }
          : { image: { url: link }, caption: '📸 *Instagram via AA MD Bot*' }, { quoted: msg });
      }
      await react('✅');
      return;
    } catch (e3) {
      await react('❌');
      reply(`❌ *Instagram download failed*\n\n${e3.message}\n\n💡 Make sure the post is *public* and the link is correct.\n\n> 📸 *AA MD Bot*`);
    }
  },
};
