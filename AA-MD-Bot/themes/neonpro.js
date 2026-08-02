// ── AA MD Bot Theme: Neon Pro ────────────────────────────────────────────────
// Enhanced neon — per-category colored icons, refined glow aesthetic
export default {
  name:        'neonpro',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Enhanced neon with category-specific glow',
  preview:     '【💜 NEON PRO 💜】',

  emojiSet: { bullet: '⟡', check: '💜', warn: '🔆' },
  colors:   { primary: '#BF00FF', secondary: '#00FFFF' },

  // Each category gets a distinct neon color icon
  catEmoji: {
    download: '🟣',
    search:   '🔵',
    media:    '🟡',
    fun:      '🟠',
    group:    '🟢',
    admin:    '🔴',
    tools:    '⚡',
    utility:  '💎',
    gb:       '🌀',
    islamic:  '☪️',
  },

  header: (bot, dev) =>
    `【${'━'.repeat(27)}】\n` +
    `【 💜 *${bot}* 💜 】\n` +
    `【  ⟡ ${dev}  】\n` +
    `【${'━'.repeat(27)}】`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n【━ 📡 *SIGNAL STATUS* ━】\n` +
    `  💜 ${uptime}  ·  ${memMB}MB  ·  ${mode}\n` +
    `  💜 ${role}  ·  Prefix *${prefix}*\n` +
    `  💜 ${totalCmds} modules online\n` +
    `【${'━'.repeat(27)}】`,

  sectionBox: (emoji, title, count, lines) =>
    `\n【━ ${emoji} *${title}* (${count}) ━】\n` +
    lines.join('') +
    `【${'━'.repeat(27)}】\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  ⟡ *${prefix}${cmd}*\n    └ _${desc}_\n`
    : `  ⟡ *${prefix}${cmd}*\n`,

  infoRow: (text) => text ? `  💜 ${text}\n` : `\n`,

  footer: (tips) =>
    `\n【━ 💡 *TIPS* ━】\n` +
    tips.map(t => `  ⟡ ${t}`).join('\n') + '\n' +
    `【${'━'.repeat(27)}】\n`,

  divider: () => `【${'━'.repeat(27)}】\n`,
};
