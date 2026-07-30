// ============================================
// AA MD Bot - Anti ViewOnce Toggle
// Developer: Ahsan Ali | AA Mods
// Enables/disables automatic view-once reveal
// ============================================
export default {
  command: "antiviewonce",
  alias: ["antivo", "aviewonce", "antivv"],
  description: "Toggle anti-viewonce feature (auto-reveal view-once media)",
  category: "owner",
  ownerOnly: true,
  async execute({ args, reply, db, isGroupMsg, jid }) {
    const input = (args[0] || "").toLowerCase().trim();
    if (!input || (input !== "on" && input !== "off")) {
      const settings = db.settings.get();
      const current = isGroupMsg
        ? (db.groups.get(jid)?.antiviewonce ?? settings.antiViewOnce ?? false)
        : (settings.antiViewOnce ?? false);
      return reply(
        `👁️ *Anti ViewOnce*\n\n` +
          `Current status: *${current ? "✅ ON" : "❌ OFF"}*\n\n` +
          `📌 *What it does:*\n` +
          `When someone sends a view-once photo/video, the bot\n` +
          `automatically saves and sends it to your *"You"* chat.\n\n` +
          `📋 *Usage:*\n` +
          `• *.antiviewonce on* — enable\n` +
          `• *.antiviewonce off* — disable\n\n` +
          `> 👁️ *AA MD Bot*`,
      );
    }
    const enable = input === "on";
    if (isGroupMsg) {
      // Group-level setting
      const grp = db.groups.get(jid) || {};
      grp.antiviewonce = enable;
      db.groups.set(jid, grp);
      return reply(
        `${enable ? "✅" : "❌"} *Anti ViewOnce ${enable ? "Enabled" : "Disabled"}*\n\n` +
          `View-once media in this group will ${enable ? "now be" : "no longer be"} auto-saved to your chat.\n\n` +
          `> 👁️ *AA MD Bot*`,
      );
    }
    // Global setting
    db.settings.setValue("antiViewOnce", enable);
    return reply(
      `${enable ? "✅" : "❌"} *Anti ViewOnce ${enable ? "Enabled" : "Disabled"}*\n\n` +
        `View-once media will ${enable ? "now be automatically" : "no longer be"} revealed to your *"You"* chat.\n\n` +
        `💡 *Tip:* Reply to any view-once with 4 same emojis (e.g. 🔥🔥🔥🔥) to reveal it manually.\n\n` +
        `> 👁️ *AA MD Bot*`,
    );
  },
};