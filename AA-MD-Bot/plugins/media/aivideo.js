// ============================================
// AA MD Bot - AI Video Generator
// Developer: Ahsan Ali | AA Mods
//
// Commands:
//   .aivideo <prompt>   — Generate AI video from text
//   .aivid <prompt>     — short alias
//   .videogen <prompt>  — alternate alias
//   .makevideo <prompt> — alternate alias
//
// Fallback chain (auto):
//   1. ZeroScope v2     — fast, globally accessible
//   2. AnimateDiff ⚡   — fast animated GIF, globally accessible
//   3. Wan2.1 T2V 1.3B  — high quality (Oracle VM)
//   4. LTX-Video        — alternate high quality (Oracle VM)
//
// Tips for BEST results:
//   ✅ Write in English
//   ✅ Be descriptive and specific
//   ✅ Include cinematic words: "cinematic", "4K", "smooth motion"
//   ✅ Describe lighting: "golden hour", "neon lights", "sunset"
//   ✅ Specify camera: "close-up", "wide angle", "drone shot"
//   ✅ Add style: "realistic", "anime", "watercolor", "oil painting"
// ============================================

import { Client }        from '@gradio/client';
import axios             from 'axios';
import fs                from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR  = path.join(__dirname, '../../temp');

const FOOTER = '\n\n> 🤖 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';

// ── Progress bar frames ───────────────────────────────────────────────────────
const FRAMES = [
  '⬛⬜⬜⬜⬜⬜⬜⬜⬜⬜  10%',
  '⬛⬛⬜⬜⬜⬜⬜⬜⬜⬜  20%',
  '⬛⬛⬛⬜⬜⬜⬜⬜⬜⬜  30%',
  '⬛⬛⬛⬛⬜⬜⬜⬜⬜⬜  40%',
  '⬛⬛⬛⬛⬛⬜⬜⬜⬜⬜  50%',
  '⬛⬛⬛⬛⬛⬛⬜⬜⬜⬜  60%',
  '⬛⬛⬛⬛⬛⬛⬛⬜⬜⬜  70%',
  '⬛⬛⬛⬛⬛⬛⬛⬛⬜⬜  80%',
  '⬛⬛⬛⬛⬛⬛⬛⬛⬛⬜  90%',
  '⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 100%',
];

// ── Quality booster — auto-append cinematic terms to improve output ───────────
// Only adds terms NOT already present in the prompt to avoid duplication.
function enhancePrompt(rawPrompt) {
  const p = rawPrompt.toLowerCase();
  const additions = [];

  // Resolution / quality
  if (!p.includes('4k') && !p.includes('8k') && !p.includes('high quality') && !p.includes('hd'))
    additions.push('high quality');

  // Motion quality
  if (!p.includes('smooth') && !p.includes('fluid'))
    additions.push('smooth motion');

  // Cinematic feel
  if (!p.includes('cinematic') && !p.includes('film'))
    additions.push('cinematic');

  // Sharpness
  if (!p.includes('sharp') && !p.includes('detailed') && !p.includes('detail'))
    additions.push('detailed');

  // Realistic lighting (only if not explicitly anime/cartoon/painting)
  const isStyled = p.includes('anime') || p.includes('cartoon') || p.includes('painting')
                || p.includes('watercolor') || p.includes('sketch') || p.includes('3d render');
  if (!isStyled && !p.includes('lighting') && !p.includes('light'))
    additions.push('realistic lighting');

  return additions.length > 0
    ? `${rawPrompt}, ${additions.join(', ')}`
    : rawPrompt;
}

// ── Standard negative prompt (blocks artefacts / bad quality) ─────────────────
const NEG_PROMPT =
  'low quality, blurry, pixelated, distorted, deformed, ugly, static, watermark, text overlay, ' +
  'jpeg artifacts, overexposed, underexposed, grainy, noisy, duplicate frames, choppy motion, ' +
  'bad anatomy, extra limbs, disfigured, poorly drawn, amateur, amateurish';

// ── Extract URL/path from Gradio result ───────────────────────────────────────
function extractFromResult(result) {
  const item = result?.data?.[0];
  if (!item) return null;
  if (item?.url)  return { url: item.url,  name: item.orig_name || 'video' };
  if (item?.path) return { localPath: item.path, name: item.orig_name || 'video' };
  if (typeof item === 'string' && item.startsWith('http')) return { url: item, name: 'video' };
  if (item?.name) return {
    url:       item.name.startsWith('http') ? item.name : null,
    localPath: item.name,
    name:      'video',
  };
  return null;
}

// ── Download file to local temp path ─────────────────────────────────────────
async function download(urlOrPath, destPath) {
  if (urlOrPath.startsWith('http')) {
    const { data } = await axios.get(urlOrPath, {
      responseType: 'arraybuffer',
      timeout: 90000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    fs.writeFileSync(destPath, Buffer.from(data));
  } else if (fs.existsSync(urlOrPath)) {
    fs.copyFileSync(urlOrPath, destPath);
  } else {
    throw new Error(`Cannot read file: ${urlOrPath}`);
  }
}

// ── Model 1: ZeroScope v2 (fast, works globally) ─────────────────────────────
async function tryZeroscope(prompt) {
  const enhanced = enhancePrompt(prompt);
  const app    = await Client.connect('hysts/zeroscope-v2');
  const result = await app.predict('/run', {
    prompt:               enhanced,
    seed:                 Math.floor(Math.random() * 2147483647),
    num_frames:           24,
    num_inference_steps:  30,   // ↑ was 25 — more steps = better quality
  });
  const file = extractFromResult(result);
  if (!file) throw new Error('No output from ZeroScope');
  return { ...file, model: 'ZeroScope v2', mime: 'video/mp4', ext: 'mp4', enhanced };
}

// ── Model 2: AnimateDiff-Lightning (fast animated GIF, works globally) ────────
async function tryAnimateDiff(prompt) {
  const enhanced = enhancePrompt(prompt);
  const app    = await Client.connect('ByteDance/AnimateDiff-Lightning');
  const result = await app.predict('/generate_image', {
    prompt:      enhanced,
    base:        'epiCrealism',  // best base for realistic outputs
    motion:      '',
    step:        8,              // ↑ was 4 — 8 steps gives much better quality
  });
  const file = extractFromResult(result);
  if (!file) throw new Error('No output from AnimateDiff');
  return { ...file, model: 'AnimateDiff-Lightning', mime: 'video/mp4', ext: 'mp4', isGif: true, enhanced };
}

// ── Model 3: Wan2.1 T2V 1.3B (high quality) ──────────────────────────────────
async function tryWan21(prompt) {
  const enhanced = enhancePrompt(prompt);
  const app    = await Client.connect('Wan-AI/Wan2.1-T2V-1.3B-Diffusers');
  const result = await app.predict('/predict', {
    prompt:               enhanced,
    negative_prompt:      NEG_PROMPT,
    aspect_ratio:         '16:9',
    num_inference_steps:  25,   // ↑ was 20
  });
  const file = extractFromResult(result);
  if (!file) throw new Error('No output from Wan2.1');
  return { ...file, model: 'Wan2.1 T2V', mime: 'video/mp4', ext: 'mp4', enhanced };
}

// ── Model 4: LTX-Video (alternate high quality) ───────────────────────────────
async function tryLTX(prompt) {
  const enhanced = enhancePrompt(prompt);
  const app  = await Client.connect('Lightricks/LTX-Video');
  const info = await app.view_api().catch(() => null);
  const eps  = Object.keys(info?.named_endpoints || {});
  const ep   = eps.find(e => e.includes('generate') || e.includes('predict') || e.includes('run')) || eps[0];
  if (!ep) throw new Error('No usable endpoint on LTX-Video');
  const result = await app.predict(ep, {
    prompt:          enhanced,
    negative_prompt: NEG_PROMPT,
  });
  const file = extractFromResult(result);
  if (!file) throw new Error('No output from LTX-Video');
  return { ...file, model: 'LTX-Video', mime: 'video/mp4', ext: 'mp4', enhanced };
}

// ── Ordered fallback chain ────────────────────────────────────────────────────
const MODELS = [
  { name: 'ZeroScope v2',          fn: tryZeroscope  },
  { name: 'AnimateDiff-Lightning', fn: tryAnimateDiff },
  { name: 'Wan2.1 T2V',            fn: tryWan21       },
  { name: 'LTX-Video',             fn: tryLTX         },
];

// ── Example prompts grouped by style ─────────────────────────────────────────
const EXAMPLES = [
  // Cinematic / nature
  'a cat walking on a beach at sunset, golden hour, cinematic',
  'heavy snowfall in a dense forest, slow motion, 4K',
  'ocean waves crashing on rocky cliffs, drone shot, wide angle',
  'a waterfall in a jungle, mist rising, cinematic lighting',
  // Action
  'a dragon flying over mountains at night, fire breath, epic',
  'a sports car drifting on a wet road, neon lights, close-up',
  'a rocket launching into space, slow motion, dramatic',
  // People / places
  'a woman dancing in the rain on a rooftop, cinematic, blur background',
  'neon-lit Tokyo streets at night, rain reflection, wide shot',
  'a cozy cafe in Paris, autumn, warm lighting, slow zoom',
  // Fantasy / sci-fi
  'a knight fighting a glowing dragon in a dark forest, epic fantasy',
  'a futuristic city in space with flying cars, sci-fi, 4K',
  'a wizard casting lightning spells in a storm, cinematic',
  // Abstract
  'colorful paint splashing in slow motion, abstract art, high speed',
  'northern lights dancing over a frozen lake, timelapse',
];

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'aivideo',
  alias: ['aivid', 'videogen', 'makevideo'],
  description: 'Generate AI video from text — 4 model fallback chain 🎬',
  category: 'media',
  usage: '.aivideo <your prompt in English>',

  async execute({ sock, msg, jid, text, react, reply }) {
    let interval;
    let loadingMsg;

    try {
      const prompt = (text || '').trim();

      // ── No prompt: rich help message ────────────────────────────────────────
      if (!prompt) {
        const ex1 = EXAMPLES[Math.floor(Math.random() * 5)];
        const ex2 = EXAMPLES[5 + Math.floor(Math.random() * 5)];
        const ex3 = EXAMPLES[10 + Math.floor(Math.random() * 5)];
        return reply(
          `🎬 *AI Video Generator*\n\n` +
          `_Type a description → AI creates a video!_\n\n` +
          `*Usage:*\n` +
          `▸ *.aivideo* <English prompt>\n\n` +
          `*Random Examples:*\n` +
          `▸ .aivideo ${ex1}\n` +
          `▸ .aivideo ${ex2}\n` +
          `▸ .aivideo ${ex3}\n\n` +
          `*📌 Tips for BEST quality videos:*\n` +
          `✅ Write in *English* (most important!)\n` +
          `✅ Be *specific* — more detail = better video\n` +
          `✅ Add *cinematic terms:* "cinematic", "4K", "slow motion"\n` +
          `✅ Describe *lighting:* "golden hour", "neon lights", "sunset"\n` +
          `✅ Specify *camera:* "close-up", "wide angle", "drone shot"\n` +
          `✅ Add *style:* "realistic", "anime", "watercolor", "3D render"\n` +
          `✅ Add *motion:* "smooth", "fluid", "timelapse", "slow motion"\n` +
          `❌ Avoid vague prompts like "a nice video" or "something cool"\n\n` +
          `*🔥 Pro Prompt Formula:*\n` +
          `_[subject] + [action] + [location] + [lighting] + [style] + [camera]_\n` +
          `e.g. "a wolf running through snow forest, blue moonlight, cinematic, drone shot"\n\n` +
          `*Models (auto fallback):*\n` +
          `1️⃣ ZeroScope v2 — fast, always works\n` +
          `2️⃣ AnimateDiff-Lightning — fast animated\n` +
          `3️⃣ Wan2.1 T2V 1.3B — high quality\n` +
          `4️⃣ LTX-Video — alternate high quality\n\n` +
          `⏱️ _Time: 1-4 minutes depending on model_\n` +
          `🆓 _Free — No API key needed_${FOOTER}`
        );
      }

      try { await react('🎬'); } catch { /* ignore */ }

      let currentModel = MODELS[0].name;

      const makeLoadingText = (frame, modelName, enhancedPrompt) =>
        `🎬 *AI Video Generator*\n\n` +
        `📝 *Your Prompt:* _${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}_\n` +
        (enhancedPrompt && enhancedPrompt !== prompt
          ? `✨ *Enhanced:* _${enhancedPrompt.slice(0, 100)}${enhancedPrompt.length > 100 ? '...' : ''}_\n`
          : '') +
        `🤖 *Model:* ${modelName}\n\n` +
        `${FRAMES[frame]}\n\n` +
        `_Please wait, may take 1-4 minutes..._\n` +
        `💡 _Tip: Specific prompts give better results!_${FOOTER}`;

      try {
        loadingMsg = await sock.sendMessage(jid, {
          text: makeLoadingText(0, currentModel, null),
        }, { quoted: msg });
      } catch (e) {
        console.error('[aivideo] Failed to send loading message:', e.message);
      }

      // Animate loading bar every 15s
      let frame = 0;
      interval = setInterval(async () => {
        try {
          if (frame < FRAMES.length - 2) {
            frame++;
            await sock.sendMessage(jid, {
              edit: loadingMsg?.key,
              text: makeLoadingText(frame, currentModel, null),
            });
          }
        } catch { /* ignore */ }
      }, 15000);

      try {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
      } catch (e) {
        console.error('[aivideo] Could not create temp dir:', e.message);
      }

      let lastError = null;
      let success   = false;

      for (const model of MODELS) {
        try {
          currentModel = model.name;

          try {
            await sock.sendMessage(jid, {
              edit: loadingMsg?.key,
              text: makeLoadingText(frame, currentModel, null),
            });
          } catch { /* ignore */ }

          const fileInfo  = await model.fn(prompt);
          const localPath = path.join(TEMP_DIR, `aivideo_${Date.now()}.${fileInfo.ext}`);

          const src = fileInfo.url || fileInfo.localPath;
          if (!src) throw new Error('No source URL/path in result');
          await download(src, localPath);

          const size = fs.statSync(localPath).size;
          if (size < 1000) throw new Error(`File too small (${size} bytes) — likely empty`);

          clearInterval(interval);
          interval = null;

          // Update progress to 100%
          try {
            await sock.sendMessage(jid, {
              edit: loadingMsg?.key,
              text:
                `🎬 *AI Video Generator*\n\n` +
                `📝 *Prompt:* _${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}_\n` +
                `🤖 *Model:* ${model.name}\n\n` +
                `${FRAMES[9]}\n\n` +
                `_Sending video..._${FOOTER}`,
            });
          } catch { /* ignore */ }

          const enhancedNote = fileInfo.enhanced && fileInfo.enhanced !== prompt
            ? `\n✨ *Enhanced:* _${fileInfo.enhanced.slice(0, 80)}_`
            : '';

          const caption =
            `🎬 *AI Video Generated!*\n\n` +
            `📝 *Prompt:* ${prompt}` +
            enhancedNote + '\n' +
            `🤖 *Model:* ${model.name}\n` +
            `✅ *Status:* Success!${FOOTER}`;

          const videoOpts = fileInfo.isGif
            ? { video: fs.readFileSync(localPath), mimetype: 'video/mp4', caption, gifPlayback: true }
            : { video: fs.readFileSync(localPath), mimetype: 'video/mp4', caption };

          await sock.sendMessage(jid, videoOpts, { quoted: msg });

          try { await react('✅'); } catch { /* ignore */ }
          success = true;

          try { fs.unlinkSync(localPath); } catch { /* ignore */ }
          break;

        } catch (err) {
          lastError = err;
          console.error(`[aivideo] ${model.name} failed:`, err.message);
        }
      }

      if (!success) {
        console.error('[aivideo] All models failed. Last error:', lastError?.message);

        try {
          await sock.sendMessage(jid, {
            edit: loadingMsg?.key,
            text: `❌ *AI Video Failed*\n\nAll 4 models tried.\n\n_${lastError?.message?.slice(0, 100) || 'Unknown error'}_${FOOTER}`,
          });
        } catch { /* ignore */ }

        try { await react('❌'); } catch { /* ignore */ }

        await reply(
          `❌ *AI Video Generation Failed*\n\n` +
          `📝 Prompt: _${prompt}_\n\n` +
          `💡 *Things to try:*\n` +
          `▸ Write your prompt in *English*\n` +
          `▸ Be more specific — "a cat running in rain" not "cat"\n` +
          `▸ Add cinematic words: "4K, cinematic, smooth motion"\n` +
          `▸ Avoid very short prompts (min 5 words work best)\n` +
          `▸ Try again in 2-3 minutes (servers may be busy)\n` +
          `▸ Oracle VM users have access to 2 extra models${FOOTER}`
        );
      }

    } catch (fatalErr) {
      console.error('[aivideo] FATAL ERROR:', fatalErr);
      try {
        await reply(
          `❌ *Unexpected Error*\n\n_${fatalErr.message?.slice(0, 150) || 'Unknown error'}_\n\n` +
          `Check console log or try again.${FOOTER}`
        );
      } catch { /* ignore */ }
    } finally {
      if (interval) clearInterval(interval);
    }
  },
};
