// ── AA MD Bot Theme: Neon ────────────────────────────────────────────────────
// Neon glow — double-line borders, purple & cyan vibes
export default {
  name:        'neon',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Neon glow with double-line borders',
  preview:     '╔══💜══╗',
  emojiSet:    { bullet: '⚡', check: '💜', warn: '🔆' },
  colors:      { primary: '#BF00FF', secondary: '#00FFFF' },

  header: (bot, dev) =>
    `╔═══════════════════════════════╗\n` +
    `║  💜 *${bot}* 💜\n` +
    `║  ⚡ ${dev}\n` +
    `╚═══════════════════════════════╝`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n╔══ 📡 *SYSTEM STATUS* ══╗\n` +
    `║  💠 Online  ⏱ ${uptime}  💾 ${memMB}MB\n` +
    `║  ✦ Prefix: *${prefix}*  •  Mode: *${mode}*\n` +
    `║  ✦ Role: ${role}  •  📦 *${totalCmds}* cmds\n` +
    `╚${'═'.repeat(32)}`,

  sectionBox: (emoji, title, count, lines) =>
    `\n╔══ ${emoji} *${title}* (${count}) ══╗\n` +
    lines.join('') +
    `╚${'═'.repeat(32)}\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `║  ⚡ *${prefix}${cmd}*\n║    └ _${desc}_\n`
    : `║  ⚡ *${prefix}${cmd}*\n`,

  infoRow: (text) => `║  💠 ${text}\n`,

  footer: (tips) =>
    `\n╔══ 💡 *QUICK TIPS* ══╗\n` +
    tips.map(t => `║  ⚡ ${t}`).join('\n') + '\n' +
    `╚${'═'.repeat(32)}\n`,

  divider: () => `╠${'═'.repeat(33)}╣\n`,
};
