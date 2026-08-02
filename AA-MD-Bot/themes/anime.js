// ── AA MD Bot Theme: Anime ───────────────────────────────────────────────────
// Cute kawaii decorations — flowers, hearts, stars
export default {
  name:        'anime',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Cute kawaii anime decorations',
  preview:     '✿♡ ANIME CHAN ♡✿',
  emojiSet:    { bullet: '♡', check: '✿', warn: '✦' },
  colors:      { primary: '#FF69B4', secondary: '#FFB6C1' },

  header: (bot, dev) =>
    `✿˚ ・ ゚✿˚ ・ ゚✿˚ ・ ゚✿˚\n` +
    `   ♡ *${bot}* ♡\n` +
    `   ✦ ${dev} ✦\n` +
    `✿˚ ・ ゚✿˚ ・ ゚✿˚ ・ ゚✿˚`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n✿─── ♡ *STATUS* ♡ ───✿\n` +
    `♡  🌸 ${uptime}  ·  💕 ${memMB}MB\n` +
    `♡  Prefix *${prefix}*  ·  ${mode} mode\n` +
    `♡  ${role}  ·  ${totalCmds} cmds uwu\n` +
    `✿${'·'.repeat(30)}✿`,

  sectionBox: (emoji, title, count, lines) =>
    `\n✿─── ${emoji} *${title}* (${count}) ───✿\n` +
    lines.join('') +
    `✿${'·'.repeat(30)}✿\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `♡  *${prefix}${cmd}*  ˚✧\n   _${desc}_\n`
    : `♡  *${prefix}${cmd}*  ˚✧\n`,

  infoRow: (text) => `✦  ${text}\n`,

  footer: (tips) =>
    `\n✿─── 💕 *HINTS* 💕 ───✿\n` +
    tips.map(t => `♡  ${t}`).join('\n') + '\n' +
    `✿${'·'.repeat(30)}✿\n`,

  divider: () => `✿${'·'.repeat(30)}✿\n`,
};
