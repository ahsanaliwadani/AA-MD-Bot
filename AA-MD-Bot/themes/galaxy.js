// ── AA MD Bot Theme: Galaxy ──────────────────────────────────────────────────
// Deep space — stars, planets, cosmic vibes
export default {
  name:        'galaxy',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Deep space cosmic theme',
  preview:     '✦·͜· GALAXY ·͜·✦',
  emojiSet:    { bullet: '★', check: '✦', warn: '🌠' },
  colors:      { primary: '#1A1A2E', secondary: '#E94560' },

  header: (bot, dev) =>
    `✦ · · · · · · · · · · · · · · ✦\n` +
    `  🌌 *${bot}*\n` +
    `  🚀 ${dev}\n` +
    `✦ · · · · · · · · · · · · · · ✦`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n✦ · *SYSTEM* · ✦\n` +
    `🌟  ${uptime}  ·  ${memMB}MB  ·  ${mode}\n` +
    `🪐  ${role}  ·  Prefix *${prefix}*\n` +
    `⭐  ${totalCmds} commands in orbit\n` +
    `· · · · · · · · · · · · · · · ·`,

  sectionBox: (emoji, title, count, lines) =>
    `\n✦ · ${emoji} *${title}* (${count}) · ✦\n` +
    lines.join('') +
    `· · · · · · · · · · · · · · · ·\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `  ★ *${prefix}${cmd}*\n    ✦ _${desc}_\n`
    : `  ★ *${prefix}${cmd}*\n`,

  infoRow: (text) => `  🌠 ${text}\n`,

  footer: (tips) =>
    `\n✦ · 🌌 *NAVIGATION* · ✦\n` +
    tips.map(t => `  ★ ${t}`).join('\n') + '\n' +
    `· · · · · · · · · · · · · · · ·\n`,

  divider: () => `· · · · · · · · · · · · · · · ·\n`,
};
