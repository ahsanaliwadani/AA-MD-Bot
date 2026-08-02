// ============================================
// AA MD Bot - Auto Status Seen (GB WhatsApp Feature)
// Per-number: toggle auto-viewing of WhatsApp status updates
// Setting key: autoStatusView (handled in sessionManager handleStatusMessage)
// ============================================

export default {
  command: 'autostatusseen',
  alias: ['autostatusseen', 'statusview', 'statusread', 'autostatus'],
  category: 'gb',
  description: 'Auto-mark all WhatsApp statuses as seen (per connected number)',
  usage: '.autostatusseen on/off',
  ownerOnly: true,

  async execute({ reply, args, sessionSettings }) {
    const toggle  = args[0]?.toLowerCase();
    const current = sessionSettings.get('autoStatusView') ?? true; // default: on

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `👁️ *Auto Status Seen*\n` +
        `Status: *${current ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `*GB WhatsApp Feature* — Silently mark all contacts' statuses as seen\n` +
        `⚠️ *Per number:* Only applies to this connected number.\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `▸ *.autostatusseen on*  — Auto-view all statuses\n` +
        `▸ *.autostatusseen off* — Stop auto-viewing statuses\n\n` +
        `📌 Contacts will see you viewed their status.\n` +
        `Combine with *.privacy* to hide your activity.\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    }

    const val = toggle === 'on';
    sessionSettings.set('autoStatusView', val);
    return reply(
      `👁️ *Auto Status Seen* is now *${val ? 'ON ✅' : 'OFF ❌'}*\n\n` +
      (val
        ? `All incoming statuses on *this number* will be marked as seen automatically.`
        : `Statuses will only be marked seen when you manually view them.`) +
      `\n\n> 🤖 *Powered by AA MD Bot*`
    );
  },
};
