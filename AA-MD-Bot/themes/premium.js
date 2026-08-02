// ── AA MD Bot Theme: Premium ─────────────────────────────────────────────────
// Luxury interface — diamond bullets, thick rules, premium feel
export default {
  name:        'premium',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Luxury premium interface',
  preview:     '◈━━ PREMIUM ━━◈',
  emojiSet:    { bullet: '◆', check: '✦', warn: '◈' },
  colors:      { primary: '#8E44AD', secondary: '#D4AC0D' },

  header: (bot, dev) =>
    `◈${'━'.repeat(29)}◈\n` +
    `   ✦ *${bot}* ✦\n` +
    `   ◆ ${dev}\n` +
    `◈${'━'.repeat(29)}◈`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n◈━━ ✦ *SYSTEM* ━━◈\n` +
    `◆  ⏱ ${uptime}   💾 ${memMB}MB\n` +
    `◆  Prefix *${prefix}*  ·  ${mode} mode\n` +
    `◆  ${role}  ·  ${totalCmds} commands\n` +
    `◈${'━'.repeat(29)}◈`,

  sectionBox: (emoji, title, count, lines) =>
    `\n◈━━ ${emoji} *${title}* ❨${count}❩ ━━◈\n` +
    lines.join('') +
    `◈${'━'.repeat(29)}◈\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `◆  *${prefix}${cmd}*\n   ╰ _${desc}_\n`
    : `◆  *${prefix}${cmd}*\n`,

  infoRow: (text) => `✦  ${text}\n`,

  footer: (tips) =>
    `\n◈━━ ✦ *QUICK HELP* ━━◈\n` +
    tips.map(t => `◆  ${t}`).join('\n') + '\n' +
    `◈${'━'.repeat(29)}◈\n`,

  divider: () => `◈${'━'.repeat(29)}◈\n`,
};
