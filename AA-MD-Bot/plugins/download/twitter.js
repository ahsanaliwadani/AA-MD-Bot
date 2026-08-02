// AA MD Bot - Twitter/X Downloader
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
const TW_RX = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+/i;

async function ytdlpVideo(url) {
  await fs.ensureDir(TEMP);
  const id = `tw_${Date.now()}`;
  const out = path.join(TEMP, `${id}.mp4`);
  const flags = [...YTDLP_ARGS];
  const ck = getCookiesFlag(); const ckParts = ck ? ck.trim().split(/\s+/) : [];
  try {
    await execFileAsync(YTDLP, [
      ...flags, url, ...ckParts,
      '-f', 'best[height<=720][ext=mp4]/best[height<=720]/best',
      '--merge-output-format', 'mp4', '--no-playlist',
      '-o', out, '--quiet', '--no-warnings',
    ], { timeout: 90000 });
    if (await fs.pathExists(out)) {
      const buf = await fs.readFile(out);
      await fs.remove(out).catch(() => {});
      if (buf?.length > 50000) return buf;
    }
  } catch {}
  await fs.remove(out).catch(() => {});
  return null;
}

// vxtwitter fallback — returns video URL + metadata
async function vxtwitter(url) {
  const api = url.replace(/https?:\/\/(www\.)?(twitter\.com|x\.com)/, 'https://api.vxtwitter.com');
  const { data } = await axios.get(api, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const vid = data?.media_extended?.find(m => m.type === 'video');
  if (!vid) throw new Error('No video in tweet');
  return { url: vid.url, text: data.text || '', author: data.user_name || '' };
}

export default {
  command: 'twitter',
  alias: ['tw', 'xdl', 'xdownload', 'tweetdl'],
  description: 'Download Twitter/X video',
  category: 'download',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    let url = text?.trim();
    if (!url) {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (q) url = (q.conversation || q.extendedTextMessage?.text || '').trim();
    }
    if (!TW_RX.test(url || '')) return reply(
      `🐦 *Twitter/X Downloader*\n\n*Usage:* ${prefix}twitter <link>\n*Example:* ${prefix}twitter https://x.com/user/status/xxx\n\n> 🤖 *AA MD Bot*`
    );

    await react('⏳');
    url = url.match(TW_RX)[0];

    // Try yt-dlp first
    let buf = await ytdlpVideo(url);
    if (buf?.length) {
      await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '🐦 *Twitter/X via AA MD Bot*' }, { quoted: msg });
      return await react('✅');
    }

    // Fallback: vxtwitter API
    try {
      const r = await vxtwitter(url);
      const vidBuf = Buffer.from((await axios.get(r.url, { responseType: 'arraybuffer', timeout: 60000 })).data);
      const cap = `🐦 *Twitter/X*\n\n${r.text ? `_${r.text.slice(0, 200)}_\n\n` : ''}👤 @${r.author}\n\n> 🤖 *AA MD Bot*`;
      await sock.sendMessage(jid, { video: vidBuf, mimetype: 'video/mp4', caption: cap }, { quoted: msg });
      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *Twitter download failed*\n\nMake sure the tweet has a video and is public.\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
