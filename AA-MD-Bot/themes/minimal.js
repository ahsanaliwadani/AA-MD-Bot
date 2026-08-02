// ── AA MD Bot Theme: Minimal ─────────────────────────────────────────────────
// Super clean — no heavy borders, just whitespace and subtle lines
export default {
  name:        'minimal',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Ultra-clean minimal design',
  preview:     '· AA MD BOT ·',
  emojiSet:    { bullet: '·', check: '✓', warn: '!' },
  colors:      { primary: '#2C3E50', secondary: '#95A5A6' },

  header: (bot, dev) =>
    `· · ·\n` +
    `  *${bot}*\n` +
    `  ${dev}\n` +
    `· · ·`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n  *Status*\n` +
    `  ${uptime}  ·  ${memMB}MB  ·  ${mode}\n` +
    `  ${role}  ·  ${prefix} prefix  ·  ${totalCmds} cmds\n` +
    `  ${'─'.repeat(28)}`,

  sectionBox: (emoji, title, count, lines) =>
    `\n  ${emoji}  *${title}*  (${count})\n` +
    `  ${'─'.repeat(26)}\n` +
    lines.join('') +
    `\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  · *${prefix}${cmd}*\n    _${desc}_\n`
    : `  · *${prefix}${cmd}*\n`,

  infoRow: (text) => `    ${text}\n`,

  footer: (tips) =>
    `\n  *Tips*\n` +
    `  ${'─'.repeat(26)}\n` +
    tips.map(t => `  · ${t}`).join('\n') + '\n',

  divider: () => `  ${'─'.repeat(28)}\n`,
};
