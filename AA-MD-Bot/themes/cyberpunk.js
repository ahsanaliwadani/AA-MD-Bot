// ── AA MD Bot Theme: Cyberpunk ───────────────────────────────────────────────
// Neon purple/yellow — cyber city vibes with block chars
export default {
  name:        'cyberpunk',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Neon cyber city — purple & yellow',
  preview:     '╔═⚡ CYBER ⚡═╗',
  emojiSet:    { bullet: '►', check: '🟣', warn: '🔸' },
  colors:      { primary: '#9B59B6', secondary: '#F39C12' },

  header: (bot, dev) =>
    `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n` +
    `▓  ⚡ *${bot}* ⚡\n` +
    `▓  🟣 ${dev}\n` +
    `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n▒▒▒ 📡 *SYS-STAT* ▒▒▒\n` +
    `▒  🔋 ONLINE  ⏱ ${uptime}  🖥 ${memMB}MB\n` +
    `▒  ► Pfx: *${prefix}*  |  Mode: *${mode}*\n` +
    `▒  ► Role: ${role}  |  📦 *${totalCmds}* cmd\n` +
    `▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒`,

  sectionBox: (emoji, title, count, lines) =>
    `\n░░░ ${emoji} *${title}* [${count}] ░░░\n` +
    lines.join('') +
    `░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  ► *${prefix}${cmd}*  |  _${desc}_\n`
    : `  ► *${prefix}${cmd}*\n`,

  infoRow: (text) => `  🔸 ${text}\n`,

  footer: (tips) =>
    `\n░░░ 💡 *TIPS* ░░░\n` +
    tips.map(t => `  ► ${t}`).join('\n') + '\n' +
    `░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░\n`,

  divider: () => `▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒\n`,
};
