// ============================================
// AA MD Bot - fakeQuoted helper
// Developer: Ahsan Ali | AA Mods
//
// Creates a minimal "quoted" message object for Baileys sendMessage.
// Usage: const fq = getFakeQuoted(msg);
//        await sock.sendMessage(jid, {...}, { quoted: fq });
// ============================================

/**
 * Returns the original Baileys message object to use as a quoted reference.
 * In Baileys, passing { quoted: msg } makes the outgoing message appear
 * to reply to that message. This helper exists for compatibility with
 * plugins that were originally written for other bot frameworks.
 *
 * @param {object} msg - The Baileys message event (proto.IWebMessageInfo)
 * @returns {object} - The same msg, ready for use as a quoted param
 */
export function getFakeQuoted(msg) {
  if (!msg) return null;

  // If msg is already a Baileys message object (has .key and .message), return as-is
  if (msg.key && msg.message) return msg;

  // If msg has a nested structure (some frameworks wrap it), try to unwrap
  if (msg.raw?.key && msg.raw?.message) return msg.raw;
  if (msg.data?.key && msg.data?.message) return msg.data;

  // Fallback: return whatever was passed — Baileys will handle it gracefully
  return msg;
}
