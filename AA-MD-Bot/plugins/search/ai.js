// ============================================
// AA MD Bot - AI Chat
// Fast APIs first: ABZTech Gemini → AB Llama → chatAI (pollinations chain)
// Per-chat memory, smart system prompt, WhatsApp markdown
// ============================================

import { chatAI, addHistory, clearHistory } from '../../lib/aiEngine.js';

export default {
  command: 'ai',
  alias: ['gpt', 'aichat', 'chat', 'ask', 'aibot'],
  description: 'Powerful AI chat — multi-model, memory, smart formatting',
  category: 'search',

  async execute({ text, reply, react, jid, prefix }) {
    if (!text) return reply(
      `🤖 *AA MD Bot AI — Powered*\n\n` +
      `*Usage:* ${prefix}ai <your question>\n\n` +
      `*Examples:*\n` +
      `• ${prefix}ai Explain quantum entanglement\n` +
      `• ${prefix}ai Write a Fibonacci sequence in Python\n` +
      `• ${prefix}ai How many rakats does each prayer have?\n` +
      `• ${prefix}ai Write a professional email for job application\n\n` +
      `*Commands:*\n` +
      `• ${prefix}ai clear — Clear chat history\n\n` +
      `*Features:*\n` +
      `• Multi-model AI (GPT-4o, Mistral, Claude)\n` +
      `• Remembers your last 10 exchanges\n` +
      `• Answers in your language (Urdu/English/Arabic)\n` +
      `• Expert-level detailed responses\n\n` +
      `> 🤖 *AA MD Bot*`
    );

    if (text.toLowerCase() === 'clear') {
      clearHistory(jid);
      return reply(`🧹 *Chat history cleared.*\n\nFresh start — ask me anything!\n\n> 🤖 *AA MD Bot*`);
    }

    await react('🤖');
    try {
      const response = await chatAI(jid, text);
      await react('✅').catch(() => {});
      await reply(`🤖 *AI*\n\n${response}\n\n> 🤖 *AA MD Bot*`);
    } catch (e) {
      await react('❌').catch(() => {});
      await reply(`❌ *AI Error:* ${e.message}\n\nTry again in a few seconds.\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
