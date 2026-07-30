// AA MD Bot — Movie Downloader
// Method 1: DavidCyrilTech /movies/fzmovies/download (FZMovies links)
// Method 2: DavidCyrilTech /movie/download (generic movie page links)
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function fzmoviesDownload(url) {
  const { data } = await axios.get(`${DC}/movies/fzmovies/download`, {
    params: { url },
    headers: { 'User-Agent': UA },
    timeout: 25000,
  });
  if (data?.success === false) throw new Error(data?.message || data?.error || 'No result');
  const d = data?.result || data?.data || data;
  const dlUrl = d?.download_link || d?.link || d?.url || d?.download;
  if (!dlUrl) throw new Error('No download link');
  return { ...d, dlUrl };
}

async function genericMovieDownload(url) {
  const { data } = await axios.get(`${DC}/movie/download`, {
    params: { url },
    headers: { 'User-Agent': UA },
    timeout: 25000,
  });
  if (data?.success === false) throw new Error(data?.message || data?.error || 'No result');
  const d = data?.result || data?.data || data;
  const dlUrl = d?.download_link || d?.link || d?.url || d?.download;
  if (!dlUrl) throw new Error('No download link');
  return { ...d, dlUrl };
}

export default {
  command: 'moviedl',
  alias: ['fzmovies', 'moviedownload', 'dlmovie', 'getmovie'],
  description: 'Download movies from FZMovies or any movie page URL',
  category: 'download',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const url = (text || '').trim();

    if (!url || !url.startsWith('http')) {
      return reply(
        `🎬 *Movie Downloader*\n\n` +
        `*Usage:* ${prefix}moviedl <movie page URL>\n\n` +
        `*Supported:*\n` +
        `• FZMovies download pages\n` +
        `• Generic movie download pages\n\n` +
        `*Examples:*\n` +
        `• ${prefix}moviedl https://fzmovies.ng/episode-download/download-movie-6053/\n\n` +
        `> 🎬 *AA MD Bot*`
      );
    }

    await react('⏳');

    let result = null;

    // Choose method based on URL
    const isFZ = /fzmovies/i.test(url);
    const methods = isFZ
      ? [['FZMovies', () => fzmoviesDownload(url)], ['Generic', () => genericMovieDownload(url)]]
      : [['Generic', () => genericMovieDownload(url)], ['FZMovies', () => fzmoviesDownload(url)]];

    for (const [name, fn] of methods) {
      try {
        result = await fn();
        if (result?.dlUrl) break;
      } catch (e) {
        console.warn(`[moviedl] ${name}: ${e.message}`);
      }
    }

    if (!result?.dlUrl) {
      await react('❌');
      return reply(
        `❌ *Movie download failed*\n\n` +
        `Could not extract a download link from:\n${url}\n\n` +
        `Make sure it is a direct download/episode page.\n\n` +
        `> 🎬 *AA MD Bot*`
      );
    }

    const title    = result?.title    || result?.movie_title || result?.name    || 'Movie';
    const quality  = result?.quality  || result?.resolution  || result?.size    || '';
    const filesize = result?.filesize || result?.file_size   || result?.size_mb || '';

    await reply(
      `🎬 *Movie Found!*\n\n` +
      `📽️ *Title:* ${title}\n` +
      (quality  ? `🎞️ *Quality:* ${quality}\n`  : '') +
      (filesize ? `📦 *Size:* ${filesize}\n`     : '') +
      `\n🔗 *Download Link:*\n${result.dlUrl}\n\n` +
      `> 🎬 *AA MD Bot*`
    );

    await react('✅');
  },
};
