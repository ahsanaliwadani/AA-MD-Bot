// ============================================
// AA MD Bot - Auto Status Seen + Auto React
// Per-number: toggle auto-viewing of WhatsApp status updates
//             and auto-reacting with a custom emoji
// Keys: autoStatusView, autoStatusReact, statusEmoji
// Handled in sessionManager handleStatusMessage
// ============================================

export default {
  command: 'autostatusseen',
  alias: ['statusread', 'statusreact', 'statusemoji'],
  category: 'gb',
  description: 'Toggle auto-view & auto-react on statuses, set reaction emoji',
  usage: '.autostatusseen on/off | .statusreact on/off | .statusemoji <emoji>',
  ownerOnly: true,

  async execute({ reply, args, command, db, config, sessionSettings }) {
    const cmd    = command.toLowerCase();
    const toggle = args[0]?.toLowerCase();
    const p      = '.';

    // ── .statusemoji <emoji> ──────────────────────────────────────────────────
    if (cmd === 'statusemoji') {
      const emoji = args[0];
      if (!emoji) {
        const current = sessionSettings.get('statusEmoji')
          ?? db.settings.getValue('statusEmoji')
          ?? config.statusEmoji ?? '❤️';
        return reply(
          `${current} *Status Reaction Emoji*\n\n` +
          `Current emoji: *${current}*\n\n` +
          `Usage: *${p}statusemoji <emoji>*\n` +
          `Example: *${p}statusemoji 🔥*\n\n` +
          `> 🤖 *Powered by AA MD Bot*`
        );
      }
      sessionSettings.set('statusEmoji', emoji);
      db.settings.setValue('statusEmoji', emoji);
      return reply(
        `${emoji} *Status reaction emoji set to:* ${emoji}\n\n` +
        `Bot will now react to all statuses with ${emoji}\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    }

    // ── .statusreact on/off ───────────────────────────────────────────────────
    if (cmd === 'statusreact') {
      const cur   = sessionSettings.get('autoStatusReact')
        ?? db.settings.getValue('autoStatusReact')
        ?? config.autoStatusReact ?? true;
      const emoji = sessionSettings.get('statusEmoji')
        ?? db.settings.getValue('statusEmoji')
        ?? config.statusEmoji ?? '❤️';

      if (!toggle || !['on', 'off'].includes(toggle)) {
        return reply(
          `${emoji} *Auto Status React*\n\n` +
          `Status: *${cur ? 'ON ✅' : 'OFF ❌'}*\n` +
          `Reaction emoji: *${emoji}*\n\n` +
          `*${p}statusreact on*   — Enable auto-react\n` +
          `*${p}statusreact off*  — Disable auto-react\n` +
          `*${p}statusemoji 🔥*   — Change emoji\n\n` +
          `> 🤖 *Powered by AA MD Bot*`
        );
      }
      const val = toggle === 'on';
      sessionSettings.set('autoStatusReact', val);
      db.settings.setValue('autoStatusReact', val);
      return reply(
        `${emoji} *Auto Status React* is now *${val ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        (val
          ? `Bot will react to every status with ${emoji}`
          : `Status reactions disabled.`) +
        `\n\n> 🤖 *Powered by AA MD Bot*`
      );
    }

    // ── .autostatusseen on/off — main command ─────────────────────────────────
    const curView  = sessionSettings.get('autoStatusView')
      ?? db.settings.getValue('autoStatusView')
      ?? config.autoStatusView ?? true;
    const curReact = sessionSettings.get('autoStatusReact')
      ?? db.settings.getValue('autoStatusReact')
      ?? config.autoStatusReact ?? true;
    const emoji    = sessionSettings.get('statusEmoji')
      ?? db.settings.getValue('statusEmoji')
      ?? config.statusEmoji ?? '❤️';

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `👁️ *Auto Status Settings*\n\n` +
        `👁️ *Auto View:*   *${curView  ? 'ON ✅' : 'OFF ❌'}*\n` +
        `${emoji} *Auto React:*  *${curReact ? 'ON ✅' : 'OFF ❌'}*\n` +
        `Emoji: *${emoji}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*${p}autostatusseen on/off*  — Auto-view statuses\n` +
        `*${p}statusreact on/off*      — Auto-react to statuses\n` +
        `*${p}statusemoji 🔥*          — Change reaction emoji\n\n` +
        `📌 Auto-view silently marks statuses as seen.\n` +
        `📌 Auto-react sends your emoji on every status.\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    }

    const val = toggle === 'on';
    sessionSettings.set('autoStatusView', val);
    db.settings.setValue('autoStatusView', val);
    return reply(
      `👁️ *Auto Status View* is now *${val ? 'ON ✅' : 'OFF ❌'}*\n\n` +
      (val
        ? `Bot will silently mark all contacts' statuses as seen.`
        : `Statuses will no longer be auto-viewed.`) +
      `\n\n> 🤖 *Powered by AA MD Bot*`
    );
  },
};
