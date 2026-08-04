// ============================================
// AA MD Bot — Menu Theme Engine
// Developer: Ahsan Ali | AA Mods
//
// Loads themes from ../themes/ dynamically.
// Themes are cached — never reloaded per-command.
// Plugin developers can register custom themes via registerTheme().
// ============================================

import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, '..', 'themes');

// ── In-memory cache: name → theme object ────────────────────────────────────
const _cache = new Map();
let   _initialized = false;

// ── Load all themes from disk ────────────────────────────────────────────────
export async function initThemes() {
  if (_initialized) return;
  _initialized = true;

  if (!existsSync(THEMES_DIR)) return;

  const files = readdirSync(THEMES_DIR).filter(f => f.endsWith('.js'));
  await Promise.all(files.map(async file => {
    try {
      const mod = await import(pathToFileURL(path.join(THEMES_DIR, file)).href);
      const theme = mod.default || mod;
      if (!theme?.name) return;

      // ── Auto-spacer: adds one blank line between every command in all themes ──
      // Themes opt out by setting  cmdSpacer: ''  (e.g. default, which has its
      // own built-in │\n spacer already).  All other themes get '\n' appended
      // after each cmdRow so commands are clearly separated in every theme.
      if (typeof theme.cmdRow === 'function' && theme.cmdSpacer !== '') {
        const _orig   = theme.cmdRow.bind(theme);
        const _spacer = theme.cmdSpacer ?? '\n';
        theme.cmdRow  = (prefix, cmd, desc) => _orig(prefix, cmd, desc) + _spacer;
      }

      _cache.set(theme.name.toLowerCase(), theme);
    } catch (e) {
      console.error(`[ThemeEngine] Failed to load ${file}:`, e.message);
    }
  }));
}

// ── Get a theme by name (falls back to 'default') ───────────────────────────
export function getTheme(name = 'default') {
  return _cache.get((name || 'default').toLowerCase())
      || _cache.get('default')
      || _fallbackTheme;
}

// ── Register a custom theme (for plugin developers) ─────────────────────────
export function registerTheme(themeObj) {
  if (!themeObj?.name) throw new Error('Theme must have a name property');
  _cache.set(themeObj.name.toLowerCase(), themeObj);
}

// ── List all loaded themes ───────────────────────────────────────────────────
export function listThemes() {
  return [..._cache.values()];
}

// ── Minimal built-in fallback (no file needed) ──────────────────────────────
const _fallbackTheme = {
  name: 'default', author: 'AA Mods', version: '1.0.0',
  description: 'Clean default style', preview: '╭── 🤖 AA MD BOT ──╮',
  emojiSet: { bullet: '▸', check: '✅', warn: '⚠️' },
  colors:   { primary: '#25D366', secondary: '#128C7E' },
  header:   (bot, dev) => `╭─────────────────────────────╮\n   🤖 *${bot}*\n   👨‍💻 ${dev}\n╰─────────────────────────────╯`,
  statusBar:({ uptime, memMB, mode, prefix, role, totalCmds }) =>
    `\n╭── 📊  *STATUS*\n│  🟢 Online  •  ⏱️ ${uptime}  •  💾 ${memMB}MB\n│  Prefix: *${prefix}*   Mode: *${mode}*   Role: ${role}\n│  📦 *${totalCmds}* commands loaded\n╰${'─'.repeat(32)}`,
  sectionBox: (emoji, title, count, lines) => {
    const hdr = `\n╭── ${emoji}  *${title}*  (${count})\n│\n`;
    return hdr + lines.join('') + `╰${'─'.repeat(32)}\n`;
  },
  cmdRow:  (prefix, cmd, desc) => desc
    ? `│  ▸ *${prefix}${cmd}*\n│     _${desc}_\n│\n`
    : `│  ▸ *${prefix}${cmd}*\n│\n`,
  infoRow: (text) => `│  ${text}\n│\n`,
  footer:  (tips) => `\n╭── 💡  *TIPS*\n${tips.map(t => `│  ▸ ${t}`).join('\n')}\n╰${'─'.repeat(32)}\n`,
  divider: () => `${'─'.repeat(34)}\n`,
};
