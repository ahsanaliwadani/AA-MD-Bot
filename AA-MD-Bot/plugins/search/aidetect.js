// AA MD Bot — AI Text Detector
// API: DavidCyrilTech /api/detect?text=<text>
// Detects whether text was written by AI or a human.
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function makeBar(pct, len = 20) {
  const filled = Math.round((pct / 100) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

export default {
  command: 'aidetect',
  alias: ['detectai', 'aicheck', 'humcheck', 'plagcheck', 'aitext', 'isai'],
  description: 'Detect if text was written by AI or a human',
  category: 'search',

  async execute({ text, reply, react, prefix, msg, quoted, sock, jid }) {
    // Accept text from arg, quoted message, or reply
    let inputText = (text || '').trim();

    if (!inputText && quoted) {
      const q = quoted.message;
      inputText = (
        q?.conversation ||
        q?.extendedTextMessage?.text ||
        q?.imageMessage?.caption ||
        ''
      ).trim();
    }

    if (!inputText) {
      return reply(
        `🤖 *AI Text Detector*\n\n` +
        `Detects if a piece of text was written by AI or a human.\n\n` +
        `*Usage:*\n` +
        `• ${prefix}aidetect <your text here>\n` +
        `• Reply to any message with ${prefix}aidetect\n\n` +
        `*Example:*\n` +
        `${prefix}aidetect The internet has revolutionized communication worldwide.\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    if (inputText.length < 20) {
      return reply(`❌ *Text too short*\n\nPlease provide at least 20 characters for accurate detection.\n\n> 🤖 *AA MD Bot*`);
    }

    await react('🔍');

    try {
      const { data } = await axios.get(`${DC}/api/detect`, {
        params: { text: inputText.slice(0, 2000) },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      if (data?.success === false) throw new Error(data?.message || data?.error || 'Detection failed');

      const d = data?.result || data?.data || data;

      // Normalise fields — API may use different key names
      const aiPct   = parseFloat(d?.ai_generated   ?? d?.ai_percentage  ?? d?.ai      ?? d?.fake    ?? 0);
      const humPct  = parseFloat(d?.human_written   ?? d?.human_percentage ?? d?.human  ?? d?.real   ?? (100 - aiPct));
      const verdict = d?.verdict  || d?.label       || d?.classification || d?.result  ||
                      (aiPct >= 70 ? 'AI Generated' : aiPct >= 40 ? 'Mixed / Uncertain' : 'Human Written');
      const confidence = d?.confidence || d?.score  || null;

      const aiBar  = makeBar(aiPct);
      const humBar = makeBar(humPct);

      const verdictEmoji = aiPct >= 70 ? '🤖' : aiPct >= 40 ? '🤔' : '✅';

      const preview = inputText.length > 100
        ? inputText.slice(0, 100) + '…'
        : inputText;

      let out =
        `🔍 *AI Text Detector*\n` +
        `${'─'.repeat(28)}\n\n` +
        `📝 *Text Preview:*\n_${preview}_\n\n` +
        `${'─'.repeat(28)}\n\n` +
        `${verdictEmoji} *Verdict: ${verdict}*\n\n` +
        `🤖 *AI Generated:* ${aiPct.toFixed(1)}%\n` +
        `${aiBar}\n\n` +
        `👤 *Human Written:* ${humPct.toFixed(1)}%\n` +
        `${humBar}\n`;

      if (confidence !== null) {
        out += `\n📊 *Confidence:* ${typeof confidence === 'number' ? (confidence * 100).toFixed(1) + '%' : confidence}\n`;
      }

      // Extra details if available
      const details = d?.details || d?.breakdown || null;
      if (details && typeof details === 'object') {
        out += `\n📋 *Details:*\n`;
        for (const [k, v] of Object.entries(details)) {
          if (typeof v === 'number' || typeof v === 'string') {
            out += `• ${k}: ${typeof v === 'number' ? v.toFixed(1) + '%' : v}\n`;
          }
        }
      }

      out += `\n> 🤖 *AA MD Bot*`;

      await react('✅');
      return reply(out);
    } catch (e) {
      await react('❌');
      reply(
        `❌ *AI Detection Failed*\n\n` +
        `${e.message}\n\n` +
        `Try again with a longer/different text sample.\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }
  },
};
