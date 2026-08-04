// ── AA MD Bot Theme: Default ─────────────────────────────────────────────────
// Clean, minimal, current bot style
export default {
  name:        'default',
  author:      'AA Mods',
  version:     '1.0.0',
  description: 'Clean default style',
  preview:     '╭── 🤖 AA MD BOT ──╮',
  emojiSet:    { bullet: '▸', check: '✅', warn: '⚠️' },
  colors:      { primary: '#25D366', secondary: '#128C7E' },
  cmdSpacer:   '',  // already has │\n spacer built into cmdRow — no extra blank needed

  header: (bot, dev) =>
    `╭─────────────────────────────╮\n` +
    `   🤖 *${bot}*\n` +
    `   👨‍💻 ${dev}\n` +
    `╰─────────────────────────────╯`,

  statusBar: ({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n╭── 📊  *STATUS*\n` +
    `│  🟢 Online  •  ⏱️ ${uptime}  •  💾 ${memMB}MB\n` +
    `│  Prefix: *${prefix}*   Mode: *${mode}*   Role: ${role}\n` +
    `│  📦 *${totalCmds}* commands loaded\n` +
    `╰${'─'.repeat(32)}`,

  sectionBox: (emoji, title, count, lines) =>
    `\n╭── ${emoji}  *${title}*  (${count})\n│\n` +
    lines.join('') +
    `╰${'─'.repeat(32)}\n`,

  cmdRow:  (prefix, cmd, desc) => desc
    ? `│  ▸ *${prefix}${cmd}*\n│     _${desc}_\n│\n`
    : `│  ▸ *${prefix}${cmd}*\n│\n`,

  infoRow: (text) => `│  ${text}\n│\n`,

  footer: (tips) =>
    `\n╭── 💡  *TIPS*\n` +
    tips.map(t => `│  ▸ ${t}`).join('\n') + '\n' +
    `╰${'─'.repeat(32)}\n`,

  divider: () => `${'─'.repeat(34)}\n`,
};
