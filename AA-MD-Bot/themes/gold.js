// ── AA MD Bot Theme: Gold ────────────────────────────────────────────────────
// Rich gold luxury — crown icons, gold rule lines
export default {
  name:        'gold',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Rich gold luxury style',
  preview:     '♛══ GOLD ══♛',
  emojiSet:    { bullet: '⬥', check: '✨', warn: '⚜️' },
  colors:      { primary: '#FFD700', secondary: '#B8860B' },

  header: (bot, dev) =>
    `♛${'═'.repeat(29)}♛\n` +
    `✨ *${bot}* ✨\n` +
    `⬥ ${dev}\n` +
    `♛${'═'.repeat(29)}♛`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n♛══ 💛 *STATUS* 💛 ══♛\n` +
    `⬥  ⏱ ${uptime}  ·  💾 ${memMB}MB\n` +
    `⬥  Prefix *${prefix}*  ·  Mode *${mode}*\n` +
    `⬥  ${role}  ·  ${totalCmds} cmds\n` +
    `♛${'═'.repeat(29)}♛`,

  sectionBox: (emoji, title, count, lines) =>
    `\n♛══ ${emoji} *${title}* (${count}) ══♛\n` +
    lines.join('') +
    `♛${'═'.repeat(29)}♛\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `⬥  *${prefix}${cmd}*\n   └ _${desc}_\n`
    : `⬥  *${prefix}${cmd}*\n`,

  infoRow: (text) => `✨  ${text}\n`,

  footer: (tips) =>
    `\n♛══ ✨ *TIPS* ✨ ══♛\n` +
    tips.map(t => `⬥  ${t}`).join('\n') + '\n' +
    `♛${'═'.repeat(29)}♛\n`,

  divider: () => `♛${'═'.repeat(29)}♛\n`,
};
