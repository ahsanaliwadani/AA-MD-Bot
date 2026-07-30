// AA MD Bot — Per-Model AI Commands
// DC endpoints (confirmed working):
//   /ai/gemini-3-pro?prompt=   → Gemini 3 Pro
//   /ai/gpt-5?prompt=          → GPT-5
//   /ai/grok-4.1-fast?prompt=  → Grok 4.1 Fast
// Pollinations fallback for models DC doesn't serve:
//   claude, deepseek, mistral
// Free GET APIs:
//   ABZTech Gemini, AB Llama
import axios from 'axios';
import { addHistory, getHistory, clearHistory, DEFAULT_SYSTEM } from '../../lib/aiEngine.js';

const DC = 'https://apis.davidcyriltech.my.id';

// ── DC AI backends (use ?prompt= param, returns {success, model, data}) ────────
async function callDC(endpoint, prompt) {
  const { data } = await axios.get(`${DC}${endpoint}`, {
    params: { prompt },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 20000,
  });
  if (!data?.success || !data?.data) throw new Error(data?.error || 'No response');
  return data.data.trim();
}

// ── Pollinations (used as fallback for claude/deepseek/mistral) ────────────────
async function callPollinations(messages, model) {
  const { data } = await axios.post(
    'https://text.pollinations.ai/openai',
    { model, messages, temperature: 0.5, max_tokens: 600 },
    { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text || text.length < 2) throw new Error('empty response');
  return text;
}

// ── ABZTech Gemini (fast free GET) ─────────────────────────────────────────────
async function callABZTechGemini(prompt) {
  const { data } = await axios.get(
    `https://api-abztech.zone.id/ai/gemini?message=${encodeURIComponent(String(prompt).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = data?.data?.answer?.trim() || data?.answer?.trim();
  if (!text || text.length < 2) throw new Error('empty response');
  return text;
}

// ── AB Llama (fast free GET) ───────────────────────────────────────────────────
async function callABLlama(prompt) {
  const { data } = await axios.get(
    `https://ab-llama-ai.abrahamdw882.workers.dev/?q=${encodeURIComponent(String(prompt).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = (data?.response || data?.data || '').trim();
  if (!text || text.length < 2) throw new Error('empty response');
  return text;
}

function cleanMd(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '*')
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/__(.*?)__/g, '_$1_')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

// ── Model configs ─────────────────────────────────────────────────────────────
// fn(messages, userMsg) → string
const MODELS = {
  gemini:   {
    label: 'Gemini 3 Pro', emoji: '✨',
    fn: async (msgs, q) => {
      try { return await callDC('/ai/gemini-3-pro', q); } catch {}
      return await callABZTechGemini(q);
    },
  },
  gpt5:     {
    label: 'GPT-5', emoji: '🤖',
    fn: async (msgs, q) => {
      try { return await callDC('/ai/gpt-5', q); } catch {}
      return await callPollinations(msgs, 'openai-fast');
    },
  },
  grok:     {
    label: 'Grok 4.1', emoji: '⚡',
    fn: async (msgs, q) => {
      try { return await callDC('/ai/grok-4.1-fast', q); } catch {}
      return await callPollinations(msgs, 'openai-fast');
    },
  },
  claude:   {
    label: 'Claude', emoji: '🎭',
    fn: (msgs) => callPollinations(msgs, 'claude-sonnet-4-5'),
  },
  deepseek: {
    label: 'DeepSeek', emoji: '🔍',
    fn: (msgs) => callPollinations(msgs, 'deepseek-r1'),
  },
  mistral:  {
    label: 'Mistral', emoji: '🌀',
    fn: (msgs) => callPollinations(msgs, 'mistral'),
  },
  llama:    {
    label: 'Llama', emoji: '🦙',
    fn: async (msgs, q) => callABLlama(q),
  },
};

// ── Plugin factory ─────────────────────────────────────────────────────────────
function makeModelPlugin(modelKey, command, aliases) {
  const m = MODELS[modelKey];
  return {
    command,
    alias: aliases,
    description: `Chat with ${m.label} AI — dedicated model`,
    category: 'search',

    async execute({ text, reply, react, jid, prefix }) {
      if (!text?.trim()) return reply(
        `${m.emoji} *${m.label}*\n\n` +
        `*Usage:* ${prefix}${command} <question>\n` +
        `*Example:* ${prefix}${command} Explain quantum physics\n\n` +
        `*Reset:* ${prefix}${command} clear\n\n` +
        `> 🤖 *AA MD Bot*`
      );

      if (text.trim().toLowerCase() === 'clear') {
        clearHistory(jid + ':' + modelKey);
        return reply(`🧹 *${m.label} chat cleared.*\n\n> 🤖 *AA MD Bot*`);
      }

      await react(m.emoji);

      const convKey = jid + ':' + modelKey;
      addHistory(convKey, 'user', text.trim());
      const messages = [
        { role: 'system', content: DEFAULT_SYSTEM },
        ...getHistory(convKey),
      ];

      try {
        const raw     = await m.fn(messages, text.trim());
        const cleaned = cleanMd(raw);
        addHistory(convKey, 'assistant', cleaned);
        await react('✅');
        await reply(`${m.emoji} *${m.label}*\n\n${cleaned}\n\n> 🤖 *AA MD Bot*`);
      } catch (e) {
        await react('❌');
        await reply(`❌ *${m.label} failed:* ${e.message}\n\nTry again in a moment.\n\n> 🤖 *AA MD Bot*`);
      }
    },
  };
}

// Main export + named exports for satellite files
export default makeModelPlugin('gemini',   'gemini',   ['geminiai', 'gemini3', 'gemini-3-pro']);
export const gpt5Plugin     = makeModelPlugin('gpt5',     'gpt5',     ['gpt-5', 'chatgpt5', 'gpt5ai']);
export const grokPlugin     = makeModelPlugin('grok',     'grok',     ['grok4', 'grok-4', 'grokfast', 'grok-ai']);
export const claudePlugin   = makeModelPlugin('claude',   'claude',   ['claudeai', 'claude3', 'claude-ai']);
export const deepseekPlugin = makeModelPlugin('deepseek', 'deepseek', ['dsai', 'deepseek-r1']);
export const mistralPlugin  = makeModelPlugin('mistral',  'mistral',  ['mistralai', 'mistral-ai']);
export const llamaPlugin    = makeModelPlugin('llama',    'llama',    ['llama3', 'llama-ai', 'llamaai']);
