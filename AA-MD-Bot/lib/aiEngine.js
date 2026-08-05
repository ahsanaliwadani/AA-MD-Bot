// ── AA MD Bot - Shared AI Engine ─────────────────────────────────────────────
// Single source for all AI chat: .ai command, .chatbot group, .autoai DM relay
// Fallback chain:
//   DC APIs (Gemini/GPT5/Grok) → ABZTech Gemini → AB Llama →
//   Pollinations POST → Pollinations GET → ch.at
//
// All providers validated — error strings like "Failed to fetch from Copilot"
// are caught and rejected before they reach the user.

import axios from 'axios';

// ── Conversation memory ───────────────────────────────────────────────────────
const _mem     = new Map(); // jid → [{ role, content }, ...]
const _lru     = new Map(); // jid → last-used timestamp
const MAX_JIDS = 300;
const MAX_TURNS = 20; // 10 exchanges

function evict() {
  if (_mem.size <= MAX_JIDS) return;
  let old = null, oldT = Infinity;
  for (const [j, t] of _lru) if (t < oldT) { old = j; oldT = t; }
  if (old) { _mem.delete(old); _lru.delete(old); }
}

export function getHistory(jid)  { return _mem.get(jid) || []; }
export function clearHistory(jid) { _mem.delete(jid); _lru.delete(jid); }

export function addHistory(jid, role, content) {
  const h = getHistory(jid);
  h.push({ role, content });
  if (h.length > MAX_TURNS) h.splice(0, h.length - MAX_TURNS);
  _mem.set(jid, h);
  _lru.set(jid, Date.now());
  evict();
}

// ── Default system prompt ─────────────────────────────────────────────────────
export const DEFAULT_SYSTEM = `You are AA MD Bot, a WhatsApp AI assistant by AA Mods.

ANSWER LENGTH — match the question:
- Simple/factual → 1 to 3 lines, straight answer
- Needs explanation → explain fully, no padding
- Step-by-step → numbered steps only
- Code → working code, explain only if asked

FORMATTING — WhatsApp markdown strictly:
- *bold* for headings and key terms
- _italic_ for examples
- • bullets, 1. 2. 3. for steps
- NO #, ##, **, __, \`\`\`

BEHAVIOR:
- Never repeat the question, never say "Great question!"
- Match user language exactly (Urdu, Roman Urdu, English, Arabic)
- For Islam: answer from Quran/Sunnah accurately
- If unsure: say so briefly`;

export const HINGLISH_SYSTEM = `You are a casual WhatsApp chatbot. Reply like a real person texting.

Rules:
- 1-2 lines MAX — short and punchy
- Use Hinglish naturally (Hindi/Urdu + English mix)
- Use real emojis (😂 😅 😎 🙄 🥺)
- If abused → give savage reply
- If someone is sad → be warm
- If someone is funny → joke back
- NEVER say you are an AI or a bot`;

// ── Response validator ────────────────────────────────────────────────────────
// Rejects API error strings that slip through as "valid" text
// (e.g. "Failed to fetch from Copilot", "Error: network timeout", etc.)
function isValidResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 3) return false;
  const lower = t.toLowerCase();
  // Hard rejections — these are API error messages, not AI responses
  if (lower.includes('failed to fetch')) return false;
  if (lower.includes('copilot') || lower.includes('capilot')) return false;
  if (lower.startsWith('error:') || lower.startsWith('failed:')) return false;
  if (lower.includes('network error') || lower.includes('fetch error')) return false;
  if (lower.includes('cloudflare') && lower.includes('error')) return false;
  if (lower.includes('5xx') || lower.includes('503') || lower.includes('502')) return false;
  if (/^(error|exception|traceback|typeerror|syntaxerror)/i.test(t)) return false;
  return true;
}

// ── Backend 0a: ABZTech Gemini (FAST — free GET, no key) ─────────────────────
async function tryABZTechGemini(userMsg) {
  const { data } = await axios.get(
    `https://api-abztech.zone.id/ai/gemini?message=${encodeURIComponent(String(userMsg).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = data?.data?.answer?.trim() || data?.answer?.trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend 0b: AB Llama (FAST — free GET, no key) ────────────────────────────
async function tryABLlama(prompt) {
  const { data } = await axios.get(
    `https://ab-llama-ai.abrahamdw882.workers.dev/?q=${encodeURIComponent(String(prompt).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = (data?.response || data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend 1: pollinations.ai POST (PRIMARY — multi-turn, context-aware) ─────
async function tryPollinationsPost(messages, model = 'openai-fast') {
  const { data } = await axios.post(
    'https://text.pollinations.ai/openai',
    { model, messages, temperature: 0.4, max_tokens: 600 },
    { headers: { 'Content-Type': 'application/json' }, timeout: 22000 }
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend 2: pollinations.ai GET (FAST — single turn, no key) ──────────────
async function tryPollinationsGet(userMsg) {
  const encoded = encodeURIComponent(String(userMsg).slice(0, 600));
  const res = await axios.get(
    `https://text.pollinations.ai/${encoded}?model=openai&seed=${Date.now() % 9999}`,
    { timeout: 18000 }
  );
  const text = typeof res.data === 'string' ? res.data.trim() : null;
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend 3: ch.at (FALLBACK — free, no key) ────────────────────────────────
async function tryChAt(userMsg) {
  const res = await axios.post(
    'https://ch.at/api/chat',
    { message: String(userMsg).slice(0, 600) },
    { headers: { 'Content-Type': 'application/json', 'User-Agent': 'AA-MD-Bot/3.0' }, timeout: 14000 }
  );
  const raw = typeof res.data === 'string'
    ? res.data
    : (res.data?.answer || res.data?.reply || res.data?.message || '');
  // Response format: "Q: ...\nA: <actual answer>"
  const match = raw.match(/\bA:\s*([\s\S]+)$/);
  const text  = match ? match[1].trim() : (raw.trim().length > 2 ? raw.trim() : null);
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend DC-a: DavidCyrilTech Gemini 3 Pro (confirmed working, ?prompt=) ──
async function tryDCGemini(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/gemini-3-pro?prompt=${encodeURIComponent(String(userMsg).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = (data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend DC-b: DavidCyrilTech GPT-5 (confirmed working, ?prompt=) ─────────
async function tryDCGpt5(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/gpt-5?prompt=${encodeURIComponent(String(userMsg).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = (data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend DC-c: DavidCyrilTech Grok 4.1 Fast (confirmed working, ?prompt=) ─
async function tryDCGrok(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/grok-4.1-fast?prompt=${encodeURIComponent(String(userMsg).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = (data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend DC-d: DavidCyrilTech Claude (extra fallback) ─────────────────────
async function tryDCClaude(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/claude?prompt=${encodeURIComponent(String(userMsg).slice(0, 800))}`,
    { timeout: 15000 }
  );
  const text = (data?.data || data?.result || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend Pollinations Mistral (fast POST, no key) ─────────────────────────
async function tryPollinationsMistral(userMsg) {
  const { data } = await axios.post(
    'https://text.pollinations.ai/openai',
    {
      model: 'mistral',
      messages: [{ role: 'user', content: String(userMsg).slice(0, 800) }],
      temperature: 0.5,
      max_tokens: 500,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 18000 }
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── Backend 4: pollinations alternate models ───────────────────────────────────
async function tryPollinationsModel(messages, model) {
  const { data } = await axios.post(
    'https://text.pollinations.ai/openai',
    { model, messages, temperature: 0.5, max_tokens: 600 },
    { headers: { 'Content-Type': 'application/json' }, timeout: 22000 }
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}


// ── Markdown cleanup for WhatsApp ─────────────────────────────────────────────
function cleanMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '*')
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/__(.*?)__/g, '_$1_')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

// ── Helper: resolves with first truthy result, or null if all fail/timeout ──────
function raceSuccess(promises, timeoutMs = 14000) {
  return new Promise(resolve => {
    let settled = 0;
    const total = promises.length;
    const timer = setTimeout(() => resolve(null), timeoutMs);
    const done = (v) => { if (v) { clearTimeout(timer); resolve(v); } else if (++settled === total) { clearTimeout(timer); resolve(null); } };
    promises.forEach(p => Promise.resolve(p).then(done).catch(() => done(null)));
  });
}

// ── Main chat function ─────────────────────────────────────────────────────────
// jid         — unique conversation key (groupJid, userJid, etc.)
// userMsg     — what the user said
// systemPrompt — optional custom system prompt (defaults to DEFAULT_SYSTEM)
// Returns the AI reply string.
export async function chatAI(jid, userMsg, systemPrompt) {
  addHistory(jid, 'user', userMsg);

  const messages = [
    { role: 'system', content: systemPrompt || DEFAULT_SYSTEM },
    ...getHistory(jid),
  ];

  // Build compact context for GET APIs (last 3 exchanges embedded in prompt)
  const hist = getHistory(jid).slice(-6).filter(m => m.role !== 'system');
  const ctxStr = hist.length
    ? hist.map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`).join('\n') + '\n'
    : '';
  const sys = (systemPrompt || DEFAULT_SYSTEM).slice(0, 300);
  const getPrompt = `${sys}\n\n${ctxStr}User: ${userMsg}\nBot:`;

  let reply = null;

  // Phase 1: Race ALL backends simultaneously — GET + POST together (max 13s)
  // Whichever responds first wins. POST has full context; GET has compact context.
  reply = await raceSuccess([
    tryDCGemini(userMsg).catch(() => null),
    tryDCGpt5(userMsg).catch(() => null),
    tryDCGrok(userMsg).catch(() => null),
    tryDCClaude(userMsg).catch(() => null),
    tryABZTechGemini(getPrompt).catch(() => null),
    tryABLlama(getPrompt).catch(() => null),
    tryPollinationsMistral(userMsg).catch(() => null),
    tryPollinationsPost(messages, 'openai-fast').catch(() => null),
  ], 13000);

  // Phase 2: Pollinations GET flat context
  if (!reply) {
    reply = await tryPollinationsGet(getPrompt).catch(() => null);
  }

  // Phase 3: ch.at last resort
  if (!reply) {
    reply = await tryChAt(userMsg).catch(() => null);
  }

  if (!reply) throw new Error('AI unavailable — try again in a moment.');

  const cleaned = cleanMarkdown(reply);
  addHistory(jid, 'assistant', cleaned);
  return cleaned;
}

// ── Fast chat function for .gf / .bf (speed-optimised, parallel GET + POST fallback) ─
// Tries fast GET APIs in parallel first; falls back to POST only if needed.
// systemPrompt is used for POST; GET APIs get a compact embedded context.
export async function chatAIFast(jid, userMsg, systemPrompt) {
  addHistory(jid, 'user', userMsg);

  // Build compact context string for GET APIs (last 3 exchanges)
  const hist = getHistory(jid).slice(-6).filter(m => m.role !== 'system');
  const ctxStr = hist.length
    ? hist.map(m => `${m.role === 'user' ? 'User' : 'Ayla'}: ${m.content}`).join('\n') + '\n'
    : '';

  // Compact system instruction embeddable in a single GET prompt
  const compactSys = `You are Ayla, a warm, playful, caring AI girlfriend chatting on WhatsApp. Reply naturally in 1-3 lines like real texting. Use 1-2 emojis. Be flirty and sweet. Match the user's language exactly (Urdu/Roman Urdu/English). NEVER say you are an AI.`;
  const getPrompt = `${compactSys}\n\n${ctxStr}User: ${userMsg}\nAyla:`;

  let reply = null;

  // Phase 1: race all fast APIs in parallel — take whichever wins first (max 13s)
  // DC APIs work best with just the user message; ABZTech/ABLlama/Mistral use full context.
  reply = await raceSuccess([
    tryDCGemini(userMsg).catch(() => null),
    tryDCGpt5(userMsg).catch(() => null),
    tryDCGrok(userMsg).catch(() => null),
    tryDCClaude(userMsg).catch(() => null),
    tryABZTechGemini(getPrompt).catch(() => null),
    tryABLlama(getPrompt).catch(() => null),
    tryPollinationsMistral(userMsg).catch(() => null),
  ], 13000);

  // Phase 2: pollinations POST with full system prompt + conversation history
  if (!reply) {
    const messages = [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM },
      ...getHistory(jid),
    ];
    reply = await tryPollinationsPost(messages, 'openai-fast').catch(() => null);
  }

  // Phase 3: pollinations GET (flat context)
  if (!reply) {
    reply = await tryPollinationsGet(getPrompt).catch(() => null);
  }

  // Phase 4: ch.at last resort
  if (!reply) {
    reply = await tryChAt(userMsg).catch(() => null);
  }

  if (!reply) throw new Error('AI unavailable — try again in a moment.');

  const cleaned = cleanMarkdown(reply);
  addHistory(jid, 'assistant', cleaned);
  return cleaned;
}
