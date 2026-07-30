// ============================================
// AA MD Bot - Anti ViewOnce Toggle
// Developer: Ahsan Ali | AA Mods
//
// Enables/disables automatic view-once reveal.
// GLOBAL: works for ALL chats (groups + DMs).
// Always sets the global antiViewOnce flag so
// that view-once from ANY number auto-forwards
// to the owner's "You" chat.
// ============================================
export default {
  command: "antiviewonce",
  alias: ["antivo", "aviewonce", "antivv"],
  description: "Toggle auto-reveal of view-once media for ALL chats",
  category: "owner",
  ownerOnly: true,

  async execute({ args, reply, db, isGroupMsg, jid }) {
    const input = (args[0] || "").toLowerCase().trim();

    // ── Status: show current state ──────────────────────────────────────────
    if (!input || (input !== "on" && input !== "off")) {
      const globalOn = db.settings.getValue("antiViewOnce") === true;
      return reply(
        `👁️ *Anti ViewOnce*\n\n` +
        `Current status: *${globalOn ? "✅ ON" : "❌ OFF"}*\n\n` +
        `📌 *What it does:*\n` +
        `When ANYONE sends a view-once photo/video\n` +
        `(group OR DM), the bot automatically saves\n` +
        `and sends it to your *"You"* chat.\n\n` +
        `📋 *Usage:*\n` +
        `• *.antiviewonce on*  — enable for ALL chats\n` +
        `• *.antiviewonce off* — disable\n\n` +
        `> 👁️ *AA MD Bot*`,
      );
    }

    const enable = input === "on";

    // ── Always set GLOBAL setting ──────────────────────────────────────────
    // This ensures view-once from ANY number (group OR DM) auto-forwards.
    db.settings.setValue("antiViewOnce", enable);

    // ── Also set group-level if run inside a group ─────────────────────────
    // Keeps per-group granularity for future per-group disable support.
    if (isGroupMsg) {
      db.groups.set(jid, { antiviewonce: enable });
    }

    return reply(
      `${enable ? "✅" : "❌"} *Anti ViewOnce ${enable ? "Enabled" : "Disabled"}*\n\n` +
      `View-once media from *ALL chats* (groups + DMs)\n` +
      `will ${enable ? "now be automatically" : "no longer be"} revealed\n` +
      `to your *"You"* chat.\n\n` +
      `💡 *Tip:* Reply to any view-once with\n` +
      `4 same emojis (e.g. 🔥🔥🔥🔥) to reveal manually.\n\n` +
      `> 👁️ *AA MD Bot*`,
    );
  },
};
