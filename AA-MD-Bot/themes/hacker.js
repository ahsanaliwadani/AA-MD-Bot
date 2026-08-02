// ── AA MD Bot Theme: Hacker ──────────────────────────────────────────────────
// Green terminal — classic Unix/Matrix hacker terminal style
export default {
  name:        'hacker',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Green terminal hacker style',
  preview:     '[root@AA-BOT]$ _',
  emojiSet:    { bullet: '$', check: '✓', warn: '!' },
  colors:      { primary: '#00FF41', secondary: '#008F11' },

  header: (bot, dev) =>
    `\`\`\`\n` +
    `[root@AA-BOT ~]#\n` +
    `System: ${bot}\n` +
    `Author: ${dev}\n` +
    `Status: ONLINE\n` +
    `\`\`\``,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n[*] *SYSTEM INFO*\n` +
    `> uptime  : ${uptime}\n` +
    `> memory  : ${memMB}MB\n` +
    `> mode    : ${mode}\n` +
    `> prefix  : ${prefix}\n` +
    `> role    : ${role}\n` +
    `> modules : ${totalCmds}\n` +
    `${'─'.repeat(30)}`,

  sectionBox: (emoji, title, count, lines) =>
    `\n[+] *${title}* — ${count} modules\n` +
    `${'─'.repeat(30)}\n` +
    lines.join('') +
    `${'─'.repeat(30)}\n`,

  cmdRow: (prefix, cmd, desc) => desc
    ? `$ *${prefix}${cmd}*  # _${desc}_\n`
    : `$ *${prefix}${cmd}*\n`,

  infoRow: (text) => `> ${text}\n`,

  footer: (tips) =>
    `\n[!] *HELP*\n` +
    `${'─'.repeat(30)}\n` +
    tips.map(t => `$ ${t}`).join('\n') + '\n' +
    `${'─'.repeat(30)}\n`,

  divider: () => `${'─'.repeat(30)}\n`,
};
