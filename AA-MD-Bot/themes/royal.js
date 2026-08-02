// ── AA MD Bot Theme: Royal ───────────────────────────────────────────────────
// Luxury royal — elaborate double-frame box drawing
export default {
  name:        'royal',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Royal luxury double-frame style',
  preview:     '╔══╦ ROYAL ╦══╗',
  emojiSet:    { bullet: '◆', check: '👑', warn: '⚜️' },
  colors:      { primary: '#6C3483', secondary: '#D4AC0D' },

  header: (bot, dev) =>
    `╔${'═'.repeat(31)}╗\n` +
    `║  👑 *${bot}* 👑\n` +
    `║  ◆ ${dev}\n` +
    `╚${'═'.repeat(31)}╝`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n╔══╦ 👑 *ROYAL STATUS* ╦══╗\n` +
    `║  ◆ Online  ·  ${uptime}  ·  ${memMB}MB\n` +
    `║  ◆ Prefix *${prefix}*  ·  Mode *${mode}*\n` +
    `║  ◆ ${role}  ·  ${totalCmds} commands\n` +
    `╚══${'═'.repeat(27)}╝`,

  sectionBox: (emoji, title, count, lines) =>
    `\n╔══╦ ${emoji} *${title}* ❬${count}❭ ╦══╗\n` +
    lines.join('') +
    `╚══${'═'.repeat(27)}╝\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `║  ◆ *${prefix}${cmd}*\n║    └ _${desc}_\n`
    : `║  ◆ *${prefix}${cmd}*\n`,

  infoRow: (text) => `║  ⚜️ ${text}\n`,

  footer: (tips) =>
    `\n╔══╦ 💡 *ROYAL GUIDE* ╦══╗\n` +
    tips.map(t => `║  ◆ ${t}`).join('\n') + '\n' +
    `╚══${'═'.repeat(27)}╝\n`,

  divider: () => `╠${'═'.repeat(31)}╣\n`,
};
