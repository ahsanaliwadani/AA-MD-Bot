// ── AA MD Bot Theme: Glass ───────────────────────────────────────────────────
// Modern frosted glass — angle brackets, clean lines
export default {
  name:        'glass',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Modern frosted glass aesthetic',
  preview:     '⟨ ⟩ GLASS ⟨ ⟩',
  emojiSet:    { bullet: '▸', check: '⊹', warn: '◌' },
  colors:      { primary: '#ECF0F1', secondary: '#2980B9' },

  header: (bot, dev) =>
    `⟨${'⎯'.repeat(29)}⟩\n` +
    `  ⊹ *${bot}*\n` +
    `  ▸ ${dev}\n` +
    `⟨${'⎯'.repeat(29)}⟩`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n⟨⎯ ⊹ *STATUS* ⊹ ⎯⟩\n` +
    `  ▸ ${uptime}  ≀  ${memMB}MB  ≀  ${mode}\n` +
    `  ▸ ${role}  ≀  Prefix *${prefix}*\n` +
    `  ▸ ${totalCmds} commands active\n` +
    `⟨${'⎯'.repeat(29)}⟩`,

  sectionBox: (emoji, title, count, lines) =>
    `\n⟨⎯ ${emoji} *${title}* (${count}) ⎯⟩\n` +
    lines.join('') +
    `⟨${'⎯'.repeat(29)}⟩\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  ▸ *${prefix}${cmd}*\n    ≀ _${desc}_\n`
    : `  ▸ *${prefix}${cmd}*\n`,

  infoRow: (text) => `  ⊹ ${text}\n`,

  footer: (tips) =>
    `\n⟨⎯ 💡 *TIPS* ⎯⟩\n` +
    tips.map(t => `  ▸ ${t}`).join('\n') + '\n' +
    `⟨${'⎯'.repeat(29)}⟩\n`,

  divider: () => `⟨${'⎯'.repeat(29)}⟩\n`,
};
