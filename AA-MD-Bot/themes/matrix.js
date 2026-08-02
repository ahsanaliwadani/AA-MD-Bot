// ── AA MD Bot Theme: Matrix ──────────────────────────────────────────────────
// Green matrix rain — block characters and terminal numerics
export default {
  name:        'matrix',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Green matrix digital rain',
  preview:     '▓▓▓ MATRIX ▓▓▓',
  emojiSet:    { bullet: '■', check: '▓', warn: '▒' },
  colors:      { primary: '#00FF41', secondary: '#003B00' },

  header: (bot, dev) =>
    `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n` +
    `▓  📟 *${bot}*\n` +
    `▓  ▶ ${dev}\n` +
    `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n▒▒ INIT SEQUENCE ▒▒\n` +
    `■ uptime  ▌ ${uptime}\n` +
    `■ memory  ▌ ${memMB}MB\n` +
    `■ mode    ▌ ${mode}\n` +
    `■ prefix  ▌ ${prefix}\n` +
    `■ role    ▌ ${role}\n` +
    `■ modules ▌ ${totalCmds}\n` +
    `▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒`,

  sectionBox: (emoji, title, count, lines) =>
    `\n▒▒ ${emoji} *${title}* [${count}] ▒▒\n` +
    lines.join('') +
    `▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `■ *${prefix}${cmd}*  ▌  _${desc}_\n`
    : `■ *${prefix}${cmd}*\n`,

  infoRow: (text) => `▶ ${text}\n`,

  footer: (tips) =>
    `\n▒▒ MANUAL ▒▒\n` +
    tips.map(t => `■ ${t}`).join('\n') + '\n' +
    `▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒\n`,

  divider: () => `▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒\n`,
};
