// ── AA MD Bot Theme: Ocean ───────────────────────────────────────────────────
// Deep ocean — wave borders, calm and cool aqua vibes
export default {
  name:        'ocean',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Deep ocean — calm aqua wave style',
  preview:     '〰🌊 OCEAN 🌊〰',

  emojiSet: { bullet: '🐚', check: '🌊', warn: '🪸' },
  colors:   { primary: '#2980B9', secondary: '#1ABC9C' },

  catEmoji: {
    download: '🐟',
    search:   '🔭',
    media:    '🐠',
    fun:      '🐬',
    group:    '🪸',
    admin:    '🦈',
    tools:    '⚓',
    utility:  '🧭',
    gb:       '🦑',
    islamic:  '☪️',
  },

  header: (bot, dev) =>
    `〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰\n` +
    `  🌊 *${bot}* 🌊\n` +
    `  🐚 ${dev}\n` +
    `〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n〰〰 🌊 *DEEP STATUS* 🌊 〰〰\n` +
    `🐚  ${uptime}  ·  ${memMB}MB  ·  ${mode}\n` +
    `🐚  ${role}  ·  Prefix *${prefix}*\n` +
    `🐚  ${totalCmds} fish in the sea\n` +
    `〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰`,

  sectionBox: (emoji, title, count, lines) =>
    `\n〰〰 ${emoji} *${title}* (${count}) 〰〰\n` +
    lines.join('') +
    `〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  🐚 *${prefix}${cmd}*\n     ↳ _${desc}_\n`
    : `  🐚 *${prefix}${cmd}*\n`,

  infoRow: (text) => text ? `  🪸 ${text}\n` : `\n`,

  footer: (tips) =>
    `\n〰〰 🧭 *NAVIGATION* 〰〰\n` +
    tips.map(t => `  🐚 ${t}`).join('\n') + '\n' +
    `〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰\n`,

  divider: () => `〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰\n`,
};
