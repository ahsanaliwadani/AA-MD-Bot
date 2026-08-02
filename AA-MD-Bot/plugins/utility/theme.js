// ============================================
// AA MD Bot — Theme Command
// Developer: Ahsan Ali | AA Mods
//
// .theme              — show all themes
// .theme list         — list with previews
// .theme set <name>   — set your theme
// .theme current      — your current theme
// .theme random       — pick random theme
// .theme reset        — back to default
//
// Each user's theme is stored independently.
// Changing your theme never affects others.
// ============================================

import { getTheme, listThemes, initThemes } from '../../lib/themeEngine.js';
import { db } from '../../lib/database.js';

await initThemes();

const FOOTER = '\n\n> 🎨 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';

// ── Per-user theme storage ───────────────────────────────────────────────────
function getUserTheme(jid) {
  return db.settings.getValue('userTheme_' + jid) || 'default';
}
function setUserTheme(jid, name) {
  db.settings.setValue('userTheme_' + jid, name);
}

export default {
  command:     'theme',
  alias:       ['menutype', 'menutheme'],
  description: 'Customize your menu theme',
  category:    'utility',
  usage:       '.theme | .theme set <name> | .theme list | .theme reset',

  async execute({ sock, jid, msg, args, senderJid, reply, react, prefix }) {
    await initThemes();
    const themes  = listThemes();
    const sub     = (args[0] || '').toLowerCase();
    const current = getUserTheme(senderJid);

    // ── .theme list ─────────────────────────────────────────────────────────
    if (sub === 'list') {
      let text = `🎨 *Available Themes* (${themes.length})\n\n`;
      for (const t of themes) {
        const isCurrent = t.name.toLowerCase() === current;
        text +=
          `${isCurrent ? '✅' : '〇'} *${t.name}*${isCurrent ? ' ← current' : ''}\n` +
          `   _${t.description || ''}_\n` +
          `   Preview: ${t.preview || '—'}\n\n`;
      }
      text +=
        `💡 *Usage:*\n` +
        `  ${prefix}theme set <name>\n` +
        `  ${prefix}theme reset${FOOTER}`;
      return sock.sendMessage(jid, { text }, { quoted: msg });
    }

    // ── .theme current ──────────────────────────────────────────────────────
    if (sub === 'current') {
      const t = getTheme(current);
      return reply(
        `🎨 *Your Current Theme*\n\n` +
        `Name:    *${t.name}*\n` +
        `Style:   _${t.description || '—'}_\n` +
        `Preview: ${t.preview || '—'}\n` +
        `Author:  ${t.author || 'AA Mods'}${FOOTER}`
      );
    }

    // ── .theme set <name> ───────────────────────────────────────────────────
    if (sub === 'set') {
      const name = (args[1] || '').toLowerCase();
      if (!name) {
        return reply(
          `❌ *Usage:* ${prefix}theme set <name>\n\n` +
          `Use *${prefix}theme list* to see all themes.${FOOTER}`
        );
      }
      const t = listThemes().find(th => th.name.toLowerCase() === name);
      if (!t) {
        const names = listThemes().map(th => th.name).join(', ');
        return reply(
          `❌ Theme *"${name}"* not found.\n\n` +
          `Available: ${names}\n\n` +
          `Use *${prefix}theme list* for previews.${FOOTER}`
        );
      }
      setUserTheme(senderJid, t.name.toLowerCase());
      await react('✅');
      return reply(
        `✅ *Theme changed!*\n\n` +
        `Your new theme: *${t.name}*\n` +
        `_${t.description || ''}_\n\n` +
        `Preview: ${t.preview || '—'}\n\n` +
        `Send *${prefix}menu* to see your new menu!${FOOTER}`
      );
    }

    // ── .theme random ───────────────────────────────────────────────────────
    if (sub === 'random') {
      const pick = themes[Math.floor(Math.random() * themes.length)];
      setUserTheme(senderJid, pick.name.toLowerCase());
      await react('🎲');
      return reply(
        `🎲 *Random theme selected!*\n\n` +
        `Theme: *${pick.name}*\n` +
        `_${pick.description || ''}_\n\n` +
        `Preview: ${pick.preview || '—'}\n\n` +
        `Send *${prefix}menu* to see it!${FOOTER}`
      );
    }

    // ── .theme reset ────────────────────────────────────────────────────────
    if (sub === 'reset') {
      setUserTheme(senderJid, 'default');
      await react('✅');
      return reply(
        `♻️ *Theme reset to default!*\n\n` +
        `Send *${prefix}menu* to see your menu.${FOOTER}`
      );
    }

    // ── .theme (overview) ───────────────────────────────────────────────────
    const cur = getTheme(current);
    let text =
      `🎨 *Menu Theme Engine*\n\n` +
      `Your theme: *${cur.name}*\n` +
      `Preview:    ${cur.preview || '—'}\n\n` +
      `*Commands:*\n` +
      `  *${prefix}theme list*         — all themes\n` +
      `  *${prefix}theme set <name>*   — change theme\n` +
      `  *${prefix}theme current*      — your theme\n` +
      `  *${prefix}theme random*       — surprise me\n` +
      `  *${prefix}theme reset*        — back to default\n\n` +
      `*Available themes:*\n` +
      themes.map(t =>
        `  ${t.name === current ? '✅' : '▸'} *${t.name}* — _${t.description || ''}_`
      ).join('\n') +
      FOOTER;

    return sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
