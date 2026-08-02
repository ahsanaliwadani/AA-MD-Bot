// ── AA MD Bot Theme: Elite ───────────────────────────────────────────────────
// THE premium "cooler interface" theme.
// Thin Unicode box drawing, category-specific icons, clean aligned layout.
// Each category gets its own accent icon for instant visual recognition.
export default {
  name:        'elite',
  author:      'AA Mods',
  version:     '1.0.0',
  description: '✦ The premium cooler interface',
  preview:     '┌─⚡ ELITE ⚡─┐',

  emojiSet: { bullet: '›', check: '✦', warn: '◌' },
  colors:   { primary: '#2ECC71', secondary: '#3498DB' },

  // ── Per-category accent icons ────────────────────────────────────────────
  // Overrides the default CAT_CFG emoji for each category in this theme
  catEmoji: {
    download: '📥',
    search:   '🤖',
    media:    '✂️',
    fun:      '🎲',
    group:    '🏠',
    admin:    '🛡',
    tools:    '⚡',
    utility:  '💡',
    gb:       '🔮',
    islamic:  '🤲',
  },

  header: (bot, dev) =>
    `┌${'─'.repeat(31)}┐\n` +
    `│   ⚡ *${bot}* ⚡\n` +
    `│   ↳ 👨‍💻 ${dev}\n` +
    `└${'─'.repeat(31)}┘`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n┌─ 📊 *STATUS* ${'─'.repeat(18)}┐\n` +
    `│  ⏱ ${uptime}  ·  💾 ${memMB}MB  ·  🌐 ${mode}\n` +
    `│  Prefix: *${prefix}*  ·  Role: ${role}\n` +
    `│  📦 *${totalCmds}* commands ready\n` +
    `└${'─'.repeat(31)}┘`,

  sectionBox: (emoji, title, count, lines) => {
    const hdr = `\n┌─ ${emoji} *${title}* ❨${count}❩ ${'─'.repeat(Math.max(1, 22 - title.length))}┐\n`;
    return hdr + lines.join('') + `└${'─'.repeat(31)}┘\n`;
  },

  cmdRow: (prefix, cmd, desc) => desc
    ? `│  › *${prefix}${cmd}*\n│    ╰ _${desc}_\n`
    : `│  › *${prefix}${cmd}*\n`,

  infoRow: (text) => text
    ? `│  ◌ ${text}\n`
    : `│\n`,

  footer: (tips) =>
    `\n┌─ 💡 *QUICK TIPS* ${'─'.repeat(14)}┐\n` +
    tips.map(t => `│  › ${t}`).join('\n') + '\n' +
    `└${'─'.repeat(31)}┘\n`,

  divider: () => `├${'─'.repeat(31)}┤\n`,
};
