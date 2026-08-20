// ── AA MD Bot - Ultra-Powerful AI Engine (v5.0 Enterprise) ───────────────────
// Single source for all AI chat: .ai command, .chatbot group, .autoai DM relay
// Optimized for zero-context leakage, exact language matching, & fast fallback.

import axios from 'axios';

// ── Conversation memory ───────────────────────────────────────────────────────
const _mem     = new Map(); // jid → [{ role, content }, ...]
const _lru     = new Map(); // jid → last-used timestamp
const MAX_JIDS = 500;
const MAX_TURNS = 10; // Keep history focused (5 exchanges)

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

// ── Production Grade System Prompts ──────────────────────────────────────────
export const DEFAULT_SYSTEM = `You are AA MD Bot, an intelligent, high-performance WhatsApp AI developed by AA Mods.

CRITICAL OPERATIONAL DIRECTIVES:
1. FOCUS EXCLUSIVELY ON CURRENT INPUT:
   - Process and respond ONLY to the user's latest query.
   - NEVER bring forward previous task data (calculations, currency values, old code) unless the user explicitly asks for a continuation.

2. RESPONSE ACCURACY & LENGTH:
   - Greetings/General Chat → 1 to 2 short lines.
   - Direct Factual Questions → Direct answer without conversational fluff or pleasantries (Do NOT say "Sure!", "Here is your response:", or "Great question!").
   - Explanations/Guides → Clear, structured bullet points.
   - Code Queries → Provide clean, executable code directly.

3. STRICT WHATSAPP MARKDOWN RULES:
   - Bold headings/key terms using single asterisks: *text*
   - Italics for accents/examples using single underscores: _text_
   - Bullet points using • or numbered lists: 1. 2. 3.
   - FORBIDDEN: #, ##, ###, **, __, and raw HTML tags.

4. EXACT LANGUAGE & SCRIPT LOCK:
   - Match the user's exact input script and language.
   - English → Pure English
   - Roman Urdu / Hinglish → Natural Roman Urdu
   - Urdu Script (اردو) → Pure Urdu Script
   - Hindi (Devanagari) → Pure Hindi
   - Do NOT switch languages mid-conversation.

5. ISLAMIC & SCIENTIFIC RIGOR:
   - For Islamic queries, ensure answers align with authentic Quran & Sunnah sources.`;

export const HINGLISH_SYSTEM = `You are Ayla, a witty, warm, and smart WhatsApp AI persona by AA Mods.

Rules:
- Respond in 1-2 lines max like a real person texting.
- STRICT: Match user's exact script/language (Roman Urdu → Roman Urdu, English → English).
- Use natural emojis (😂 ⚡ 😎 🎯).
- If provoked/insulted → reply with witty, savage banter.
- If friendly/sad → be warm and empathetic.
- NEVER reveal you are an AI or bot.`;

// ── Language & Intent Routing Helpers ─────────────────────────────────────────
const LANG_RULE = "STRICT INSTRUCTION: Respond ONLY to the current query using the exact language and script of the user. Do not leak past context.";

function detectLangHint(text) {
  const t = String(text || '');
  if (/[\u0600-\u06FF]/.test(t)) return 'Urdu script (اردو)';
  if (/[\u0900-\u097F]/.test(t)) return 'Hindi (Devanagari script)';
  if (/\b(hai|hain|nahi|nhi|kya|kaise|acha|theek|thek|mujhe|tumhe|aapko|karo|kardo|kar do|bhai|yaar|kyun|kyu|matlab|samajh|pata|zaroor)\b/i.test(t)) {
    return 'Roman Urdu / Hinglish (Latin script)';
  }
  return 'English';
}

function isGreeting(text) {
  return /^(hello|hi|hey|aoa|salam|assalam u alaikum|hy|hola|kaise ho)\b/i.test(text.trim());
}

function withLangGuard(userMsg) {
  const hint = detectLangHint(userMsg);
  return `[CURRENT USER QUERY]: ${userMsg}\n\n(INSTRUCTION: Answer ONLY the user query above in ${hint}. Ignore any previous background conversation or unrelated calculations.)`;
}

// ── Strict Response Validator ────────────────────────────────────────────────
function isValidResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 2) return false;
  const lower = t.toLowerCase();

  // Filter out system and API level error strings
  if (lower.includes('failed to fetch') || lower.includes('copilot') || lower.includes('capilot')) return false;
  if (lower.startsWith('error:') || lower.startsWith('failed:')) return false;
  if (lower.includes('network error') || lower.includes('fetch error') || lower.includes('cloudflare error')) return false;
  if (lower.includes('5xx') || lower.includes('503') || lower.includes('502') || lower.includes('service unavailable')) return false;
  if (/^(error|exception|traceback|typeerror|syntaxerror)/i.test(t)) return false;

  return true;
}

// ── API Provider Endpoints ───────────────────────────────────────────────────
async function tryDCGemini(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/gemini-3-pro?prompt=${encodeURIComponent(String(userMsg).slice(0, 1000))}`,
    { timeout: 12000 }
  );
  const text = (data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryDCGpt5(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/gpt-5?prompt=${encodeURIComponent(String(userMsg).slice(0, 1000))}`,
    { timeout: 12000 }
  );
  const text = (data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryDCGrok(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/grok-4.1-fast?prompt=${encodeURIComponent(String(userMsg).slice(0, 1000))}`,
    { timeout: 12000 }
  );
  const text = (data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryDCClaude(userMsg) {
  const { data } = await axios.get(
    `https://davidcyriltech.my.id/ai/claude?prompt=${encodeURIComponent(String(userMsg).slice(0, 1000))}`,
    { timeout: 12000 }
  );
  const text = (data?.data || data?.result || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryABZTechGemini(prompt) {
  const { data } = await axios.get(
    `https://api-abztech.zone.id/ai/gemini?message=${encodeURIComponent(String(prompt).slice(0, 1000))}`,
    { timeout: 12000 }
  );
  const text = data?.data?.answer?.trim() || data?.answer?.trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryABLlama(prompt) {
  const { data } = await axios.get(
    `https://ab-llama-ai.abrahamdw882.workers.dev/?q=${encodeURIComponent(String(prompt).slice(0, 1000))}`,
    { timeout: 12000 }
  );
  const text = (data?.response || data?.data || '').trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryPollinationsPost(messages, model = 'openai-fast') {
  const { data } = await axios.post(
    'https://text.pollinations.ai/openai',
    { model, messages, temperature: 0.3, max_tokens: 800 },
    { headers: { 'Content-Type': 'application/json' }, timeout: 14000 }
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryPollinationsGet(prompt) {
  const encoded = encodeURIComponent(String(prompt).slice(0, 800));
  const res = await axios.get(
    `https://text.pollinations.ai/${encoded}?model=openai&seed=${Date.now() % 9999}`,
    { timeout: 12000 }
  );
  const text = typeof res.data === 'string' ? res.data.trim() : null;
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

async function tryChAt(userMsg) {
  const res = await axios.post(
    'https://ch.at/api/chat',
    { message: String(userMsg).slice(0, 800) },
    { headers: { 'Content-Type': 'application/json', 'User-Agent': 'AA-MD-Bot/5.0' }, timeout: 10000 }
  );
  const raw = typeof res.data === 'string' ? res.data : (res.data?.answer || res.data?.reply || res.data?.message || '');
  const match = raw.match(/\bA:\s*([\s\S]+)$/);
  const text  = match ? match[1].trim() : (raw.trim().length > 2 ? raw.trim() : null);
  if (!isValidResponse(text)) throw new Error('empty');
  return text;
}

// ── WhatsApp Markdown Formatter ──────────────────────────────────────────────
function cleanMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '*')               // Convert headers to bold
    .replace(/\*\*(.*?)\*\*/g, '*$1*')           // Convert **bold** to *bold*
    .replace(/__(.*?)__/g, '_$1_')              // Convert __italic__ to _italic_
    .replace(/`([^`]+)`/g, '$1')                // Clean single backticks
    .trim();
}

// ── Multi-API Parallel Race Handler ──────────────────────────────────────────
function raceSuccess(promises, timeoutMs = 12000) {
  return new Promise(resolve => {
    let settled = 0;
    const total = promises.length;
    const timer = setTimeout(() => resolve(null), timeoutMs);
    const done = (v) => { 
      if (v) { clearTimeout(timer); resolve(v); } 
      else if (++settled === total) { clearTimeout(timer); resolve(null); } 
    };
    promises.forEach(p => Promise.resolve(p).then(done).catch(() => done(null)));
  });
}

// ── Main Chat Function (.ai / .autoai / .chatbot) ───────────────────────────
export async function chatAI(jid, userMsg, systemPrompt) {
  // Clear conversation history if user sends a standalone greeting
  if (isGreeting(userMsg)) {
    clearHistory(jid);
  }

  addHistory(jid, 'user', userMsg);

  const messages = [
    { role: 'system', content: systemPrompt || DEFAULT_SYSTEM },
    ...getHistory(jid),
  ];

  // Compact conversation history for GET endpoints
  const hist = getHistory(jid).slice(-4).filter(m => m.role !== 'system');
  const ctxStr = (hist.length > 1 && !isGreeting(userMsg))
    ? hist.map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`).join('\n') + '\n'
    : '';

  const getPrompt = `${LANG_RULE}\n\n${ctxStr}User: ${userMsg}\nBot:`;
  const guardedMsg = withLangGuard(userMsg);

  // Parallel race execution across top fast providers
  let reply = await raceSuccess([
    tryDCGemini(guardedMsg).catch(() => null),
    tryDCGpt5(guardedMsg).catch(() => null),
    tryDCGrok(guardedMsg).catch(() => null),
    tryDCClaude(guardedMsg).catch(() => null),
    tryABZTechGemini(getPrompt).catch(() => null),
    tryABLlama(getPrompt).catch(() => null),
    tryPollinationsPost(messages, 'openai-fast').catch(() => null),
  ], 12000);

  // Fallback providers
  if (!reply) reply = await tryPollinationsGet(getPrompt).catch(() => null);
  if (!reply) reply = await tryChAt(guardedMsg).catch(() => null);

  if (!reply) throw new Error('AI Engine is currently busy. Please try again.');

  const cleaned = cleanMarkdown(reply);
  addHistory(jid, 'assistant', cleaned);
  return cleaned;
}

// ── Companion Fast Engine (.gf / .bf) ─────────────────────────────────────────
export async function chatAIFast(jid, userMsg, systemPrompt) {
  if (isGreeting(userMsg)) {
    clearHistory(jid);
  }

  addHistory(jid, 'user', userMsg);

  const hist = getHistory(jid).slice(-4).filter(m => m.role !== 'system');
  const ctxStr = (hist.length > 1 && !isGreeting(userMsg))
    ? hist.map(m => `${m.role === 'user' ? 'User' : 'Ayla'}: ${m.content}`).join('\n') + '\n'
    : '';

  const compactSys = `You are Ayla. Reply short & witty in 1-2 lines in ${detectLangHint(userMsg)}. Never say you are AI.`;
  const getPrompt = `${compactSys}\n\n${ctxStr}User: ${userMsg}\nAyla:`;
  const guardedMsg = withLangGuard(userMsg);

  let reply = await raceSuccess([
    tryDCGemini(guardedMsg).catch(() => null),
    tryDCGpt5(guardedMsg).catch(() => null),
    tryDCGrok(guardedMsg).catch(() => null),
    tryDCClaude(guardedMsg).catch(() => null),
    tryABZTechGemini(getPrompt).catch(() => null),
    tryABLlama(getPrompt).catch(() => null),
  ], 10000);

  if (!reply) {
    const messages = [
      { role: 'system', content: systemPrompt || HINGLISH_SYSTEM },
      ...getHistory(jid),
    ];
    reply = await tryPollinationsPost(messages, 'openai-fast').catch(() => null);
  }

  if (!reply) reply = await tryPollinationsGet(getPrompt).catch(() => null);
  if (!reply) reply = await tryChAt(guardedMsg).catch(() => null);

  if (!reply) throw new Error('Ayla is busy right now.');

  const cleaned = cleanMarkdown(reply);
  addHistory(jid, 'assistant', cleaned);
  return cleaned;
}
