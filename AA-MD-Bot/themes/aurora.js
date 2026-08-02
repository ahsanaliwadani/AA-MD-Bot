// ── AA MD Bot Theme: Aurora ──────────────────────────────────────────────────
// Northern lights — soft dots, celestial glows, dreamy vibe
export default {
  name:        'aurora',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Northern lights — dreamy celestial style',
  preview:     '∘◉∘ AURORA ∘◉∘',

  emojiSet: { bullet: '✦', check: '◉', warn: '◌' },
  colors:   { primary: '#1ABC9C', secondary: '#9B59B6' },

  catEmoji: {
    download: '🌠',
    search:   '🔭',
    media:    '🌈',
    fun:      '🎆',
    group:    '🌍',
    admin:    '🌟',
    tools:    '💫',
    utility:  '🌙',
    gb:       '🪐',
    islamic:  '🌙',
  },

  header: (bot, dev) =>
    `∘ · ◉ · ∘ · ◉ · ∘ · ◉ · ∘ · ◉\n` +
    `  🌌 *${bot}*\n` +
    `  ✦ ${dev}\n` +
    `∘ · ◉ · ∘ · ◉ · ∘ · ◉ · ∘ · ◉`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n∘◉∘ 🌟 *SYSTEM* 🌟 ∘◉∘\n` +
    `  ✦ ${uptime}  ·  ${memMB}MB  ·  ${mode}\n` +
    `  ✦ ${role}  ·  Prefix *${prefix}*\n` +
    `  ✦ ${totalCmds} stars in orbit\n` +
    `∘ · · · · · · · · · · · · · · ∘`,

  sectionBox: (emoji, title, count, lines) =>
    `\n∘◉∘ ${emoji} *${title}* (${count}) ∘◉∘\n` +
    lines.join('') +
    `∘ · · · · · · · · · · · · · · ∘\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  ✦ *${prefix}${cmd}*\n    ↳ _${desc}_\n`
    : `  ✦ *${prefix}${cmd}*\n`,

  infoRow: (text) => text ? `  ◌ ${text}\n` : `\n`,

  footer: (tips) =>
    `\n∘◉∘ 💫 *GUIDE* 💫 ∘◉∘\n` +
    tips.map(t => `  ✦ ${t}`).join('\n') + '\n' +
    `∘ · · · · · · · · · · · · · · ∘\n`,

  divider: () => `∘ · · · · · · · · · · · · · · ∘\n`,
};
