// AA MD Bot — NexRay message-card maker
// Creates a shareable alert-style image from short text.
import axios from 'axios';

const API = 'https://api.nexray.eu.cc/maker/msg';
const ICONS = new Set(['success', 'warning', 'error', 'info', 'question']);

function parseInput(input, botName) {
  const parts = input.split('|').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  // .msg <message>
  // .msg <title> | <message> | <icon>
  if (parts.length === 1) return { title: botName, message: parts[0], icon: 'warning' };
  return {
    title: parts[0],
    message: parts[1],
    icon: ICONS.has((parts[2] || 'warning').toLowerCase()) ? parts[2].toLowerCase() : 'warning',
  };
}

function pickImageUrl(payload) {
  const candidates = [
    payload?.url, payload?.result?.url, payload?.data?.url,
    payload?.image, payload?.result?.image, payload?.data?.image,
  ];
  return candidates.find(value => typeof value === 'string' && /^https?:\/\//i.test(value)) || null;
}

async function generateCard(params) {
  const response = await axios.get(API, {
    params,
    responseType: 'arraybuffer',
    timeout: 25000,
    headers: { Accept: 'image/*,application/json;q=0.9,*/*;q=0.8', 'User-Agent': 'AA-MD-Bot/3.0' },
    validateStatus: status => status >= 200 && status < 300,
  });
  const type = String(response.headers['content-type'] || '').toLowerCase();
  const buffer = Buffer.from(response.data);
  if (type.startsWith('image/') && buffer.length > 500) return buffer;

  // The provider may return JSON containing a hosted image instead of bytes.
  try {
    const imageUrl = pickImageUrl(JSON.parse(buffer.toString('utf8')));
    if (!imageUrl) throw new Error('No image URL in API response');
    const image = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 25000 });
    const imageBuffer = Buffer.from(image.data);
    if (imageBuffer.length > 500) return imageBuffer;
  } catch (error) {
    if (error.message === 'No image URL in API response') throw error;
  }
  throw new Error('The maker API did not return an image');
}

export default {
  command: 'msg',
  alias: ['msgmaker', 'alertcard', 'nexmsg'],
  description: 'Create a styled message card image',
  category: 'media',
  usage: '.msg <message>  |  .msg <title> | <message> | <icon>',

  async execute({ text, reply, react, sock, jid, msg, prefix, config }) {
    const card = parseInput((text || '').trim(), config?.botName || 'AA MD Bot');
    if (!card) {
      return reply(
        `🪧 *Message Card Maker*\n\n` +
        `*Usage:*\n` +
        `• ${prefix}msg Server restart at 10 PM\n` +
        `• ${prefix}msg Maintenance | Server restart at 10 PM | warning\n\n` +
        `*Icons:* success, warning, error, info, question`
      );
    }
    if (card.title.length > 80 || card.message.length > 300) {
      return reply('❌ Keep the title under 80 characters and the message under 300 characters.');
    }

    await react('🎨');
    try {
      const image = await generateCard(card);
      await sock.sendMessage(jid, {
        image,
        caption: `🪧 *${card.title}*\n_${card.icon}_ message card`,
      }, { quoted: msg });
      await react('✅');
    } catch (error) {
      await react('❌');
      await reply(`❌ Message card could not be generated. Please try again.\n\n> ${error.message}`);
    }
  },
};
