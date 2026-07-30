// AA MD Bot — Anime & Realistic Image Generation
// Primary:  DC /animagine  (anime style, returns cdn_url)
// Alt:      DC /flux       (any style, returns binary)
// Usage:
//   .animagine <prompt>          → anime style
//   .epicrealism <prompt>        → photorealistic (flux fallback)
//   .fluxv2 <prompt>             → flux-v2 style (flux fallback)
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';
const POLLINATIONS = 'https://image.pollinations.ai/prompt';

// Fetch image from DC /animagine (returns JSON with cdn_url)
async function genAnimagine(prompt) {
  const { data } = await axios.get(`${DC}/animagine`, {
    params: { prompt },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 35000,
  });
  if (!data?.success || !data?.cdn_url) throw new Error(data?.message || 'No image URL returned');
  // Download the cdn_url
  const { data: imgBuf } = await axios.get(data.cdn_url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  return { buf: Buffer.from(imgBuf), source: 'DavidCyrilTech Animagine' };
}

// Fetch image from DC /flux (returns binary directly)
async function genFlux(prompt) {
  const { data } = await axios.get(`${DC}/flux`, {
    params: { prompt },
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 40000,
  });
  if (!data || data.byteLength < 1000) throw new Error('Empty image');
  return { buf: Buffer.from(data), source: 'DavidCyrilTech Flux' };
}

// Pollinations fallback (always works)
async function genPollinations(prompt, model = 'flux') {
  const seed = Math.floor(Math.random() * 9999999);
  const url  = `${POLLINATIONS}/${encodeURIComponent(prompt)}?model=${model}&seed=${seed}&nologo=true`;
  const { data } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 90000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  return { buf: Buffer.from(data), source: `Pollinations (${model})` };
}

const STYLE_CONFIG = {
  animagine:   { label: 'Anime',        emoji: '🎌', primaryFn: genAnimagine,  fallbackModel: 'flux-anime' },
  epicrealism: { label: 'Photorealistic', emoji: '📸', primaryFn: genFlux,    fallbackModel: 'flux-realism' },
  fluxv2:      { label: 'Flux v2',      emoji: '⚡', primaryFn: genFlux,       fallbackModel: 'flux' },
};

async function generate(style, prompt) {
  const cfg = STYLE_CONFIG[style];
  // Try primary DC endpoint
  try { return await cfg.primaryFn(prompt); } catch {}
  // Fallback: Pollinations
  return await genPollinations(prompt, cfg.fallbackModel);
}

function makePlugin(command, aliases, style, desc) {
  const cfg = STYLE_CONFIG[style];
  return {
    command,
    alias: aliases,
    description: desc,
    category: 'search',

    async execute({ text, reply, react, sock, jid, msg, prefix }) {
      if (!text?.trim()) return reply(
        `${cfg.emoji} *${cfg.label} Image Generator*\n\n` +
        `*Usage:* ${prefix}${command} <description>\n` +
        `*Example:* ${prefix}${command} ${
          style === 'animagine'   ? 'sakura tree in autumn wind, girl, sunset' :
          style === 'epicrealism' ? 'Pakistani warrior, dramatic lighting, 8k' :
                                    'cyberpunk city, neon lights, rain, detailed'
        }\n\n> 🎨 *AA MD Bot*`
      );

      await react('🎨');
      try {
        const { buf, source } = await generate(style, text.trim());

        await sock.sendMessage(jid, {
          image: buf,
          caption:
            `${cfg.emoji} *${cfg.label} Image*\n\n` +
            `📝 _${text.trim().slice(0, 80)}${text.length > 80 ? '…' : ''}_\n` +
            `🔧 *Engine:* ${source}\n\n` +
            `> 🎨 *AA MD Bot*`,
        }, { quoted: msg });

        await react('✅');
      } catch (e) {
        await react('❌');
        reply(`❌ *Image generation failed*\n\n${e.message}\n\nTry a simpler description.\n\n> 🎨 *AA MD Bot*`);
      }
    },
  };
}

// Export the animagine plugin (epicrealism + fluxv2 have their own files below)
export default makePlugin('animagine', ['animeart', 'animeimg', 'anime-art', 'animegen'], 'animagine',
  'Anime-style AI image via DavidCyrilTech');

// Named exports for epicrealism and fluxv2 so they load as separate plugins
export const epicrealismPlugin = makePlugin('epicrealism', ['realism', 'realistic', 'photoreal', 'epicreal'], 'epicrealism',
  'Photorealistic AI image generation');

export const fluxv2Plugin = makePlugin('fluxv2', ['fluxgen', 'flux2', 'fluximage'], 'fluxv2',
  'Flux-v2 AI image generation');
