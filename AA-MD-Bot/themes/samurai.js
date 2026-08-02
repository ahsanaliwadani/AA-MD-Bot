// ── AA MD Bot Theme: Samurai ─────────────────────────────────────────────────
// Japanese warrior — clean zen-inspired lines with katana precision
export default {
  name:        'samurai',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Japanese warrior — clean zen precision',
  preview:     '⚔️ ─ SAMURAI ─ ⚔️',

  emojiSet: { bullet: '⚔️', check: '🎋', warn: '🌸' },
  colors:   { primary: '#C0392B', secondary: '#2C3E50' },

  catEmoji: {
    download: '⬇️',
    search:   '👁',
    media:    '🎭',
    fun:      '🎎',
    group:    '⛩️',
    admin:    '🗡️',
    tools:    '⚒️',
    utility:  '🎋',
    gb:       '🌸',
    islamic:  '☪️',
  },

  header: (bot, dev) =>
    `⚔️${'─'.repeat(29)}⚔️\n` +
    `   🎌 *${bot}*\n` +
    `   ⚔️ ${dev}\n` +
    `⚔️${'─'.repeat(29)}⚔️`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n⚔️─ 🎌 *DOJO STATUS* ─⚔️\n` +
    `  🎋 ${uptime}  ·  ${memMB}MB\n` +
    `  🎋 ${mode} mode  ·  Prefix *${prefix}*\n` +
    `  🎋 ${role}  ·  ${totalCmds} techniques\n` +
    `⚔️${'─'.repeat(29)}⚔️`,

  sectionBox: (emoji, title, count, lines) =>
    `\n⚔️─ ${emoji} *${title}* [${count}] ─⚔️\n` +
    lines.join('') +
    `⚔️${'─'.repeat(29)}⚔️\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  ⚔️ *${prefix}${cmd}*\n     ↳ _${desc}_\n`
    : `  ⚔️ *${prefix}${cmd}*\n`,

  infoRow: (text) => text ? `  🌸 ${text}\n` : `\n`,

  footer: (tips) =>
    `\n⚔️─ 🎋 *WISDOM* ─⚔️\n` +
    tips.map(t => `  ⚔️ ${t}`).join('\n') + '\n' +
    `⚔️${'─'.repeat(29)}⚔️\n`,

  divider: () => `⚔️${'─'.repeat(29)}⚔️\n`,
};
