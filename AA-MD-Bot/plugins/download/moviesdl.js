// AA MD Bot — MovieBox
// Downloads only from curated, official open-film sources.
import axios from 'axios';

const WHATSAPP_FILE_LIMIT = 45 * 1024 * 1024;
const OPEN_FILMS = [
  {
    title: 'Big Buck Bunny',
    year: '2008',
    aliases: ['bbb', 'big bunny'],
    license: 'Creative Commons Attribution',
    fileName: 'Big_Buck_Bunny_320p.mp4',
    downloadUrl: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    sourceUrl: 'https://studio.blender.org/films/big-buck-bunny/',
  },
  {
    title: 'Elephants Dream',
    year: '2006',
    aliases: ['elephant dream'],
    license: 'Creative Commons Attribution',
    fileName: 'Elephants_Dream.mp4',
    downloadUrl: 'https://download.blender.org/ED/ed_1024_512kb.mp4',
    sourceUrl: 'https://studio.blender.org/films/elephants-dream/',
  },
  {
    title: 'Sintel',
    year: '2010',
    aliases: ['sintel movie'],
    license: 'Creative Commons Attribution',
    fileName: 'Sintel.mp4',
    downloadUrl: 'https://download.blender.org/durian/movies/sintel-1024-surround.mp4',
    sourceUrl: 'https://studio.blender.org/films/sintel/',
  },
  {
    title: 'Tears of Steel',
    year: '2012',
    aliases: ['tear of steel', 'tos'],
    license: 'Creative Commons Attribution',
    fileName: 'Tears_of_Steel.mov',
    downloadUrl: 'https://download.blender.org/durian/movies/ToS/tearsofsteel_1080p.mov',
    sourceUrl: 'https://studio.blender.org/films/tears-of-steel/',
  },
];

function findFilm(query) {
  const needle = query.trim().toLowerCase();
  return OPEN_FILMS.find(film => [film.title, ...film.aliases].some(value => value.toLowerCase().includes(needle) || needle.includes(value.toLowerCase())));
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readRemoteSize(headers) {
  const length = Number(headers['content-length']);
  if (Number.isFinite(length) && length > 0) return length;
  const total = /\/(\d+)$/.exec(String(headers['content-range'] || ''))?.[1];
  const rangeSize = Number(total);
  return Number.isFinite(rangeSize) && rangeSize > 0 ? rangeSize : null;
}

async function getRemoteSize(url) {
  try {
    const response = await axios.head(url, { timeout: 15000, maxRedirects: 3, validateStatus: status => status < 400 });
    const size = readRemoteSize(response.headers);
    if (size) return size;
  } catch {}

  // Some official CDNs disable HEAD. A one-byte range request gives us the
  // total safely without downloading the whole movie into bot memory.
  try {
    const response = await axios.get(url, {
      headers: { Range: 'bytes=0-0' }, responseType: 'stream', timeout: 15000,
      maxRedirects: 3, validateStatus: status => status === 200 || status === 206,
    });
    response.data.destroy();
    return readRemoteSize(response.headers);
  } catch {
    return null;
  }
}

function directLinkMessage(film, reason = '') {
  return [
    `🎬 *${film.title}* (${film.year})`,
    `📜 Licence: ${film.license}`,
    reason,
    '',
    '🔗 *Official source & download:*',
    film.sourceUrl,
    '',
    '> Download is provided only by the rights holder under its listed licence.',
  ].filter(Boolean).join('\n');
}

export default {
  command: 'moviebox',
  alias: ['moviedl', 'openmovie', 'legalmovie'],
  description: 'Search and download curated open-licence movies',
  category: 'download',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const query = (text || '').trim();
    if (!query) {
      return reply(
        `🎬 *MovieBox — Open-Licence Movies*\n\n` +
        `*Usage:* ${prefix}moviebox <title>\n\n` +
        `*Available:* ${OPEN_FILMS.map(film => film.title).join(', ')}\n\n` +
        '> Only curated films from official sources are available.'
      );
    }

    const film = findFilm(query);
    if (!film) {
      return reply(
        `🔎 No verified open-licence title found for *${query}*.\n\n` +
        `Try: ${OPEN_FILMS.map(f => `*${f.title}*`).join(', ')}\n\n` +
        '> MovieBox does not source copyrighted films without permission.'
      );
    }

    await react('⏳');
    const size = await getRemoteSize(film.downloadUrl);
    if (!size || size > WHATSAPP_FILE_LIMIT) {
      await react('🔗');
      const reason = size
        ? `📦 File size: ${formatBytes(size)} — this is above the bot's ${formatBytes(WHATSAPP_FILE_LIMIT)} WhatsApp delivery limit.`
        : '📦 The file size could not be confirmed safely for WhatsApp delivery.';
      return reply(directLinkMessage(film, reason));
    }

    try {
      await sock.sendMessage(jid, {
        document: { url: film.downloadUrl },
        mimetype: 'video/mp4',
        fileName: film.fileName,
        caption: `🎬 *${film.title}* (${film.year})\n📦 ${formatBytes(size)}\n📜 ${film.license}\n\n> Downloaded from the official source.`,
      }, { quoted: msg });
      await react('✅');
    } catch {
      await react('🔗');
      await reply(directLinkMessage(film, '⚠️ WhatsApp could not attach this file, so here is the official source link.'));
    }
  },
};
