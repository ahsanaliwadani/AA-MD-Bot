// AA MD Bot - Threads (Meta) Downloader
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { YTDLP, YTDLP_ARGS, getCookiesFlag } from '../../lib/ytdlp.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');
const TH_RX = /https?:\/\/(www\.)?threads\.(net|com)\/[^\s]+/i;

async function ytdlpVideo(url) {
  await fs.ensureDir(TEMP);
  const out = path.join(TEMP, `th_${Date.now()}.mp4`);
  const flags = [...YTDLP_ARGS];
  const ck = getCookiesFlag(); const ckParts = ck ? ck.trim().split(/\s+/) : [];
  try {
    await execFileAsync(YTDLP, [
      ...flags, url, ...ckParts,
      '-f', 'best[height<=720]/best', '--no-playlist',
      '-o', out, '--quiet', '--no-warnings',
    ], { timeout: 90000 });
    if (await fs.pathExists(out)) {
      const buf = await fs.readFile(out);
      await fs.remove(out).catch(() => {});
      if (buf?.length > 10000) return buf;
    }
  } catch {}
  await fs.remove(out).catch(() => {});
  return null;
}

// savethreads.com API fallback
async function savethreads(url) {
  const { data } = await axios.post('https://savethreads.com/api/download',
    { url },
    { headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }
  );
  const items = data?.data || [];
  const vid = items.find(i => i.type === 'video' || i.url?.includes('.mp4'));
  const img = items.find(i => i.type === 'image' || i.url?.match(/\.(jpg|jpeg|png|webp)/i));
  return vid ? { type: 'video', url: vid.url } : img ? { type: 'image', url: img.url } : null;
}

export default {
  command: 'threads',
  alias: ['th', 'threadsdl'],
  description: 'Download Threads (Meta) video or image',
  category: 'download',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    let url = text?.trim();
    if (!url) {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (q) url = (q.conversation || q.extendedTextMessage?.text || '').trim();
    }
    if (!TH_RX.test(url || '')) return reply(
      `🧵 *Threads Downloader*\n\n*Usage:* ${prefix}threads <link>\n*Example:* ${prefix}threads https://threads.net/p/xxx\n\n> 🤖 *AA MD Bot*`
    );

    await react('⏳');
    url = url.match(TH_RX)[0].replace(/[.,!?;]$/, '');

    // Primary: yt-dlp
    let buf = await ytdlpVideo(url);
    if (buf?.length) {
      await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '🧵 *Threads via AA MD Bot*' }, { quoted: msg });
      return await react('✅');
    }

    // Fallback: savethreads API
    try {
      const r = await savethreads(url);
      if (!r) throw new Error('No media found');
      const mediaBuf = Buffer.from((await axios.get(r.url, { responseType: 'arraybuffer', timeout: 60000 })).data);
      if (r.type === 'video') {
        await sock.sendMessage(jid, { video: mediaBuf, mimetype: 'video/mp4', caption: '🧵 *Threads via AA MD Bot*' }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { image: mediaBuf, caption: '🧵 *Threads via AA MD Bot*' }, { quoted: msg });
      }
      await react('✅');
    } catch {
      await react('❌');
      reply(`❌ *Threads download failed*\n\nMake sure the post has video/image and is public.\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
