// ============================================
// AA MD Bot - Fake Typing / Recording (GB Feature)
// Simulate typing or recording presence
// ============================================

import { sendOnlinePresence } from './alwaysonline.js';

export default {
  command: 'typing',
  alias: ['faketype', 'recording', 'fakerecord', 'presence'],
  category: 'gb',
  description: 'Simulate typing or recording presence in a chat',
  usage: '.typing <seconds>  |  .recording <seconds>',
  ownerOnly: true,

  async execute({ reply, react, args, sock, jid, msg, command, sessionId }) {
    const seconds = Math.min(parseInt(args[0]) || 5, 30); // max 30s
    const isRecording = command === 'recording' || command === 'fakerecord';
    const presenceType = isRecording ? 'recording' : 'composing';
    const label = isRecording ? '🎙️ Recording' : '⌨️ Typing';

    try {
      const sent = await sendOnlinePresence(sock, sessionId, presenceType, jid);
      if (!sent) {
        await react('ℹ️');
        return reply(`ℹ️ Presence is hidden while *.alwaysonline* is OFF. Turn *.alwaysonline on* first if you want to show ${presenceType}.`);
      }
      await react('✅');
      await reply(`${label} presence sent for *${seconds}s* in this chat.`);

      setTimeout(async () => {
        await sendOnlinePresence(sock, sessionId, 'paused', jid);
      }, seconds * 1000);
    } catch (err) {
      await react('❌');
      reply('❌ Failed. Please try again in a few seconds.');
    }
  },
};
