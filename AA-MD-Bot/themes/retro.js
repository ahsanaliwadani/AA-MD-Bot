// ── AA MD Bot Theme: Retro ───────────────────────────────────────────────────
// Retro arcade / pixel game — 8-bit vibes, classic game UI
export default {
  name:        'retro',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Retro arcade pixel game style',
  preview:     '★彡 RETRO 彡★',

  emojiSet: { bullet: '▶', check: '✔', warn: '!' },
  colors:   { primary: '#E74C3C', secondary: '#F1C40F' },

  catEmoji: {
    download: '🕹️',
    search:   '🔎',
    media:    '🎮',
    fun:      '👾',
    group:    '🏆',
    admin:    '🎯',
    tools:    '🛠',
    utility:  '⚙',
    gb:       '📟',
    islamic:  '☪️',
  },

  header: (bot, dev) =>
    `★彡${'═'.repeat(25)}彡★\n` +
    `  🕹️ *${bot}*\n` +
    `  ▶ ${dev}\n` +
    `★彡${'═'.repeat(25)}彡★`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n[▶▶] *PLAYER STATUS* [◀◀]\n` +
    `[${'='.repeat(28)}]\n` +
    `▶  UPTIME  : ${uptime}\n` +
    `▶  MEMORY  : ${memMB}MB\n` +
    `▶  MODE    : ${mode}\n` +
    `▶  PREFIX  : ${prefix}\n` +
    `▶  ROLE    : ${role}\n` +
    `▶  MODULES : ${totalCmds}\n` +
    `[${'='.repeat(28)}]`,

  sectionBox: (emoji, title, count, lines) =>
    `\n[▶] ${emoji} *${title}* [${count}]\n` +
    `[${'─'.repeat(28)}]\n` +
    lines.join('') +
    `[${'─'.repeat(28)}]\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  ▶ *${prefix}${cmd}*   _${desc}_\n`
    : `  ▶ *${prefix}${cmd}*\n`,

  infoRow: (text) => text ? `  » ${text}\n` : `\n`,

  footer: (tips) =>
    `\n[?] *HELP MENU*\n` +
    `[${'─'.repeat(28)}]\n` +
    tips.map(t => `  ▶ ${t}`).join('\n') + '\n' +
    `[${'─'.repeat(28)}]\n`,

  divider: () => `[${'═'.repeat(28)}]\n`,
};
