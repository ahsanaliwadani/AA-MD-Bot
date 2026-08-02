// ── AA MD Bot Theme: Fire ────────────────────────────────────────────────────
// Blazing fire — hot energy, flame borders, intense look
export default {
  name:        'fire',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Blazing fire — hot intense energy',
  preview:     '🔥═══ FIRE ═══🔥',

  emojiSet: { bullet: '🔥', check: '✅', warn: '⚠️' },
  colors:   { primary: '#E74C3C', secondary: '#F39C12' },

  catEmoji: {
    download: '🔥',
    search:   '🔥',
    media:    '🔥',
    fun:      '🔥',
    group:    '🔥',
    admin:    '🔥',
    tools:    '🔥',
    utility:  '🔥',
    gb:       '🔥',
    islamic:  '☪️',
  },

  header: (bot, dev) =>
    `🔥${'═'.repeat(29)}🔥\n` +
    `🔥  *${bot}*\n` +
    `🔥  ${dev}\n` +
    `🔥${'═'.repeat(29)}🔥`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n🔥══ 🌡️ *HEAT STATUS* ══🔥\n` +
    `🔥  ⏱ ${uptime}  💾 ${memMB}MB\n` +
    `🔥  ${mode} mode  ·  Prefix *${prefix}*\n` +
    `🔥  ${role}  ·  ${totalCmds} cmds\n` +
    `🔥${'═'.repeat(29)}🔥`,

  sectionBox: (emoji, title, count, lines) =>
    `\n🔥══ ${emoji} *${title}* (${count}) ══🔥\n` +
    lines.join('') +
    `🔥${'═'.repeat(29)}🔥\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `🔥 *${prefix}${cmd}*  — _${desc}_\n`
    : `🔥 *${prefix}${cmd}*\n`,

  infoRow: (text) => text ? `🌡️ ${text}\n` : `\n`,

  footer: (tips) =>
    `\n🔥══ 💡 *TIPS* ══🔥\n` +
    tips.map(t => `🔥 ${t}`).join('\n') + '\n' +
    `🔥${'═'.repeat(29)}🔥\n`,

  divider: () => `🔥${'═'.repeat(29)}🔥\n`,
};
