// ============================================
// AA MD Bot - Main Menu
// Clean, role-aware, duplicate-free
// Theme Engine integrated — each user picks their own visual style
// SuperOwner commands → .smenu only
// Owner commands → visible to owner only
// ============================================

import { plugins }                  from "../../lib/pluginLoader.js";
import config                        from "../../config.js";
import { db }                        from "../../lib/database.js";
import { getTheme, initThemes }      from "../../lib/themeEngine.js";
import fs                            from "fs";
import path                          from "path";
import { fileURLToPath }             from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pre-load themes at module init time (cached — no reload per-command)
await initThemes();

// ── Banner ────────────────────────────────────────────────────────────────────
function getBanner() {
  for (const p of [
    path.join(__dirname, "../../banner.jpeg"),
    path.join(__dirname, "../../banner.jpg"),
  ]) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p); } catch {}
  }
  return null;
}

// ── Newsletter context ────────────────────────────────────────────────────────
function getCtx() {
  const jid = global._AA_NEWSLETTER_JID;
  if (!jid) return null;
  return {
    forwardingScore: 999, isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid:   jid,
      newsletterName:  global._AA_NEWSLETTER_NAME || "AA MD Bot",
      serverMessageId: Math.floor(Math.random() * 99999) + 1,
    },
  };
}

const FOOTER = `\n> 🤖 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*`;

// ── Category display config ───────────────────────────────────────────────────
const CAT_CFG = {
  download: { e: "⬇️",  n: "DOWNLOADS",    max:  0 },  // show all
  search:   { e: "🔍",  n: "SEARCH & AI",  max:  0 },  // show all
  media:    { e: "🎨",  n: "MEDIA TOOLS",  max:  0 },  // show all
  fun:      { e: "🎮",  n: "FUN & GAMES",  max:  0 },  // show all
  group:    { e: "👥",  n: "GROUP",         max:  0 },  // show all
  admin:    { e: "🛡️",  n: "GROUP ADMIN",  max:  0 },
  tools:    { e: "🔧",  n: "TOOLS",         max:  0 },  // show all
  utility:  { e: "🛠️",  n: "UTILITY",      max:  0 },  // show all (incl. theme)
  gb:       { e: "📱",  n: "GB FEATURES",  max:  0 },  // show all
  islamic:  { e: "☪️",  n: "ISLAMIC",      max:  0 },
};
const CAT_ORDER = ["download","search","media","fun","group","admin","tools","utility","gb","islamic"];

const OWNER_GB_CMDS = new Set([
  "afk","alwaysonline","autoread","autoreply","flood","ghost","onlinealert","typing",
  "autoreact","anticall","antispam",
]);
const OWNER_TOOLS_CMDS = new Set([
  "backup","dbstats","logs","reload","speedtest","system","memory",
]);
const SUPER_CMDS = new Set([
  "eval","shell","broadcast","maintenance","setnewsletter","followchannel",
  "adddevice","deldevice","devices","addowner","delowner","setowner","banuser",
  "smenu","supermenu","devmenu","adminpanel","backup","database","logs","reload","system",
]);

function greet() {
  const h = new Date().getUTCHours() + 5;
  if (h < 12) return "🌅 Assalamualaikum";
  if (h < 17) return "☀️ Assalamualaikum";
  return "🌆 Assalamualaikum";
}

// ── Build deduplicated, role-filtered plugin map ──────────────────────────────
function buildCategoryMap(isOwner) {
  const seen = new Set();
  const catMap = {};
  for (const plugin of plugins.values()) {
    const mainCmd = Array.isArray(plugin.command) ? plugin.command[0] : plugin.command;
    if (!mainCmd || seen.has(mainCmd)) continue;
    seen.add(mainCmd);
    const cat = (plugin.category || "general").toLowerCase();
    if (cat === "owner") continue;
    if (plugin.superOwnerOnly) continue;
    if (SUPER_CMDS.has(mainCmd)) continue;
    if (!isOwner) {
      if (plugin.ownerOnly) continue;
      if (cat === "gb"    && OWNER_GB_CMDS.has(mainCmd))    continue;
      if (cat === "tools" && OWNER_TOOLS_CMDS.has(mainCmd)) continue;
    }
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push({ cmd: mainCmd, desc: (plugin.description || "").slice(0, 42), ownerOnly: !!plugin.ownerOnly });
  }
  return catMap;
}

// ── Render a category box using the active theme ──────────────────────────────
// Themes can define a catEmoji map to override the default CAT_CFG icons.
function renderCat(emoji, label, cmds, pref, max, catKey, theme) {
  const shown = max > 0 ? cmds.slice(0, max) : cmds;
  const more  = cmds.length - shown.length;

  const lines = shown.map(({ cmd, desc }) => theme.cmdRow(pref, cmd, desc));
  if (more > 0) lines.push(theme.infoRow(`_…+${more} more → *${pref}menu ${catKey}*_`));

  // Use theme's category-specific icon if defined, otherwise use the default
  const themedEmoji = theme.catEmoji?.[catKey] ?? emoji;
  return theme.sectionBox(themedEmoji, label, cmds.length, lines);
}

// ── Single-category detail view ───────────────────────────────────────────────
function renderCatDetail(cat, cmds, pref) {
  const cfg = CAT_CFG[cat] || { e: "📌", n: cat.toUpperCase() };
  let text = `╔══════════════════════════════════╗\n`;
  text += `║  ${cfg.e}  *${cfg.n} COMMANDS*\n`;
  text += `╚══════════════════════════════════╝\n`;
  for (const { cmd, desc } of cmds) {
    text += `\n▸ *${pref}${cmd}*`;
    if (desc) text += `\n  ╰ _${desc}_`;
    text += `\n`;
  }
  text += `\n> 💡 *${pref}menu* — back to main menu`;
  return text;
}

// ── Build owner controls section using theme ──────────────────────────────────
function buildOwnerSection(pref, isSuperOwnerUser, theme) {
  const L = (text) => theme.infoRow(text);
  const C = (cmd, desc) => theme.cmdRow(pref, cmd, desc);

  const lines = [
    L("🔒 *Privacy & Stealth*"),
    C("ghost on/off",            "Appear offline to everyone"),
    C("alwaysonline on/off",     "Always show online status"),
    C("privacy",                 "Last seen, DP, blue ticks settings"),
    C("fls 8:30pm / 20:30",      "Set custom last seen time (daily)"),
    L("_fls off — disable fake last seen_"),
    C("anticall on/off",         "Block incoming calls"),
    C("autoreact on/off",        "Auto emoji react to messages"),
    C("blocklist",               "View/manage blocked contacts"),
    L(""),
    L("👁️ *View-Once Reveal*"),
    C("antiviewonce on/off",     "Auto-reveal all view-once to (You) chat"),
    C("vv",                      "Reply to view-once — reveal to (You) chat"),
    C("avv",                     "Same as .vv (alternate command)"),
    C("good",                    "Silent reveal, no reply to sender"),
    C("vvemoji 😍",              "Set your one-emoji reveal trigger"),
    L(""),
    L("🧹 *Message Tools*"),
    C("stripfwd",                "Re-send without 'Forwarded' & Channel tags"),
    C("aj",                      "Delete all my messages in this chat"),
    L(""),
    L("🗑️ *Anti-Delete*"),
    C("antidelete on/off",       "Recover deleted msgs → (You) chat"),
    L(""),
    L("🤖 *Auto Features*"),
    C("autoread on/off",         "Silent read all messages"),
    C("autoreply <msg>",         "Auto reply when busy"),
    C("afk <reason>",            "Set AFK status with reason"),
    C("onlinealert <num>",       "Alert when contact comes online"),
    C("schedule <time> <msg>",   "Schedule a message to send later"),
    L(""),
    L("⚙️ *Bot Settings*"),
    C("bs",                      "Full settings panel"),
    C("mode public/private",     "Change bot access mode"),
    C("antispam on/off",         "Anti-spam message filter"),
    C("theme",                   "🆕 Change menu visual theme"),
    C("restart",                 "Restart the bot"),
    L(""),
    L("🔍 *Lookup Tools*"),
    C("simowner <number>",       "Pakistan SIM owner info 🇵🇰 (Truecaller)"),
    C("ac <number>",             "Check if a number is on WhatsApp"),
    L(""),
    L("🤖 *AI & Chatbot*"),
    C("ai <question>",           "Powerful AI chat — multi-model"),
    C("aivideo <prompt>",        "Generate AI videos from text"),
    C("chatbot on/off",          "Group chatbot — reply when @mentioned"),
    L(""),
    L("📱 *Telegram*"),
    L("Admin Bot: /start → /pair <phone>"),
    L("Features Bot: /help"),
    ...(isSuperOwnerUser ? [C("smenu", "Super Owner control panel")] : []),
  ];

  return theme.sectionBox("⚙️", "OWNER CONTROLS", lines.length, lines);
}

// ── Build NEW & UPDATED section using theme ───────────────────────────────────
function buildNewSection(pref, theme) {
  const L = (text) => theme.infoRow(text);
  const C = (cmd, desc) => theme.cmdRow(pref, cmd, desc);

  const lines = [
    L("✨ *Latest Additions*"),
    C("theme",                   "Change menu visual theme (19 themes!)"),
    L("_theme set elite | fire | ocean | samurai | aurora…_"),
    L(""),
    L("🤖 *AI Models*"),
    C("gpt55",       "GPT-5.5"),
    C("claude",      "Claude Sonnet 4.6"),
    C("deepseek",    "DeepSeek v4 Pro"),
    C("gemini",      "Gemini 3 Pro"),
    C("gpt5",        "GPT-5"),
    C("grok",        "Grok 4.1 Fast"),
    C("mistral",     "Mistral AI"),
    C("llama",       "Llama AI"),
    L(""),
    L("🎨 *Media / Canvas*"),
    C("jail",        "Jail bars overlay on image"),
    C("aiedit",      "AI image editor (1–2 min)"),
    C("rembg",       "Remove image background"),
    C("attp",        "Text → animated sticker"),
    C("toanime",     "Photo → anime style"),
    C("toghibli",    "Photo → Ghibli style"),
    C("upscale",     "Upscale / enhance image quality"),
    L(""),
    L("🔍 *Search / Stalk*"),
    C("telestalk",   "Telegram profile lookup"),
    C("igstalk",     "Instagram profile lookup"),
    C("wachannel",   "WhatsApp channel stalk"),
    C("tiktokstalk", "TikTok account stalk"),
    C("ytstalk",     "YouTube channel stalk"),
    C("ghstalk",     "GitHub profile stalk"),
    C("pinstalk",    "Pinterest profile stalk"),
    C("scstalk",     "SoundCloud profile stalk"),
    C("twstalk",     "Twitter/X profile stalk"),
    L(""),
    L("⬇️ *Downloads*"),
    C("spotify",     "Spotify track → audio"),
    C("play",        "YouTube music/video download"),
    C("tiktok",      "TikTok video without watermark"),
    C("ig",          "Instagram video/reel"),
    C("fb",          "Facebook video"),
    C("twitter",     "Twitter/X video"),
    C("capcut",      "CapCut video"),
    C("threads",     "Threads video"),
    C("pinterest",   "Pinterest image/video"),
    C("moviedl",     "Movie download"),
    C("apk",         "APK downloader"),
    C("ringtone",    "Ringtone download"),
    C("github",      "GitHub repo zip download"),
    L(""),
    L("🔧 *Tools*"),
    C("ac",          "🆕 Check if a number is on WhatsApp"),
    C("boost",       "Universal view booster (auto-detect)"),
    C("igboost",     "Instagram view booster"),
    C("tiktokboost", "TikTok view booster"),
    C("ytboost",     "YouTube view booster"),
    C("livescore",   "Live sports scores"),
    C("translate",   "Translate text to any language"),
    C("aidetect",    "Detect if text is AI-written"),
    C("tts",         "Text to speech"),
    C("ss",          "Screenshot any website"),
    C("currency",    "Currency converter"),
    C("tempmail",    "Temporary email address"),
    C("tempnumber",  "Temporary phone number"),
    C("textstyle",   "Stylish text fonts"),
    C("morse",       "Morse code converter"),
    C("bmi",         "Body mass index calculator"),
    C("habit",       "Habit tracker"),
    C("geoip",       "IP geolocation lookup"),
    C("vcard",       "Generate contact vCard"),
  ];

  return theme.sectionBox("🆕", "NEW & UPDATED COMMANDS", lines.length, lines);
}

// ── Fun sub-sections (GF, BF, AnimeDP, Adult) ────────────────────────────────
function buildFunExtras(pref, theme) {
  const L = (text) => theme.infoRow(text);
  const C = (cmd, desc) => theme.cmdRow(pref, cmd, desc);
  let out = "";

  // AI Girlfriend
  out += theme.sectionBox("💕", "AI GIRLFRIEND — AYLA", 8, [
    C("gf <message>",    "Chat with Ayla — she remembers your convo"),
    C("gf mood",         "Ayla's current mood"),
    C("gf level",        "Your relationship level"),
    C("gf gift",         "Send her a virtual gift 🎁"),
    C("gf mode adult",   "Enable Adult Mood of GF"),
    C("gf mode normal",  "Reset to normal chat mode"),
    C("gf reset",        "Start fresh"),
    L("_💡 Relationship grows with every message!_"),
  ]);

  // AI Boyfriend
  out += theme.sectionBox("💙", "AI BOYFRIEND — ZAYAN", 6, [
    C("bf <message>",  "Chat with Zayan"),
    C("bf mood",       "See his current mood"),
    C("bf level",      "Your relationship level"),
    C("bf gift",       "Send him a virtual gift"),
    C("bf lang",       "Change language"),
    C("bf reset",      "Start over fresh"),
  ]);

  // Anime DPs
  out += theme.sectionBox("🌸", "ANIME PROFILE PICTURES", 3, [
    C("ppcouple",  "Random anime couple — boy + girl PP"),
    C("ppboy",     "Random anime boy PP"),
    C("ppgirl",    "Random anime girl PP"),
    L(`_Aliases: ${pref}ppcp  ${pref}couplepp  ${pref}animepic_`),
  ]);

  return out;
}

export default {
  command: "menu",
  alias:   ["help", "commands", "cmds"],
  description: "Show all available commands",
  category: "utility",
  usage:    ".menu | .menu <category>",

  async execute({ sock, jid, msg, isOwner, args, senderJid, sessionSettings }) {
    const settings = db.settings.get();
    const pushName = msg.pushName || "User";
    const pref     = ".";   // prefix is always "." — setprefix removed
    // Read mode from per-session settings (where .mode command stores it)
    const mode = (
      sessionSettings?.get?.('botMode') ??
      settings.botMode ??
      config.botMode ??
      "public"
    ).toUpperCase();
    const isSuperOwnerUser =
      senderJid?.split("@")[0]?.split(":")[0] === String(config.superOwner);
    const role = isSuperOwnerUser ? "👑 Super Owner" : isOwner ? "🔑 Owner" : "👤 User";

    const upSec  = Math.floor(process.uptime());
    const upH    = Math.floor(upSec / 3600);
    const upM    = Math.floor((upSec % 3600) / 60);
    const uptime = upH > 0 ? `${upH}h ${upM}m` : `${upM}m ${upSec % 60}s`;
    const memMB  = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const catMap   = buildCategoryMap(isOwner);
    const totalCmds = Object.values(catMap).reduce((s, a) => s + a.length, 0);
    const ctx      = getCtx();

    // ── Get user's theme ────────────────────────────────────────────────────
    const themeName = db.settings.getValue("userTheme_" + senderJid) || "default";
    const theme     = getTheme(themeName);

    // ── Single-category detail view ─────────────────────────────────────────
    if (args[0]) {
      const key     = args[0].toLowerCase();
      const matched = CAT_ORDER.find((c) => c.startsWith(key)) || key;
      const cmds    = catMap[matched];

      if (!cmds?.length) {
        const list = CAT_ORDER.filter((c) => catMap[c]?.length)
          .map((c) => `  ${(CAT_CFG[c] || {}).e || "📌"} *${c}*  (${catMap[c].length})`)
          .join("\n");
        const payload = { text: `❌ Category *"${key}"* not found.\n\n📦 *Available:*\n${list}${FOOTER}` };
        if (ctx) payload.contextInfo = ctx;
        return sock.sendMessage(jid, payload, { quoted: msg });
      }

      let detail = renderCatDetail(matched, cmds, pref) + FOOTER;
      const payload = { text: detail };
      if (ctx) payload.contextInfo = ctx;
      return sock.sendMessage(jid, payload, { quoted: msg });
    }

    // ── Full menu ───────────────────────────────────────────────────────────
    const greeting = isSuperOwnerUser
      ? `👑 *${greet()}, Ahsan Bhai!*\n_Super Owner — Full Access_`
      : isOwner
        ? `🔑 *${greet()}, Owner!*\n_Bot control panel active_`
        : `✨ *${greet()}, ${pushName}!*\n_Welcome to AA MD Bot_`;

    let menu = "";

    // Header (themed)
    menu += theme.header("A A   M D   B O T", "Ahsan Ali Wadani") + "\n\n";
    menu += `${greeting}\n`;

    // Status bar (themed)
    menu += theme.statusBar({ uptime, memMB, mode, prefix: pref, role, totalCmds }) + "\n";

    // Owner controls (themed)
    if (isOwner) {
      menu += "\n" + buildOwnerSection(pref, isSuperOwnerUser, theme);

      // Islamic quick-access
      menu += theme.sectionBox("☪️", "ISLAMIC PANEL", catMap["islamic"]?.length || 61, [
        theme.cmdRow(pref, "islamicmenu", "Full Islamic command panel"),
        theme.infoRow("_Duas • Zikr • Hadith • Kalimas • Adhkar • Salah_"),
      ]);

      // GB quick-access
      menu += theme.sectionBox("📱", "GB FEATURES", 5, [
        theme.cmdRow(pref, "gbmenu", "Full GB WhatsApp-like features"),
        theme.infoRow("_Ghost • Privacy • AutoRead • ViewOnce • OnlineAlert_"),
      ]);
    }

    // New & Updated section (themed)
    menu += "\n" + buildNewSection(pref, theme);

    // Public categories
    const SKIP_FOR_OWNER = isOwner ? new Set(["islamic", "gb"]) : new Set();
    const orderedCats = [
      ...CAT_ORDER.filter((c) => catMap[c]?.length),
      ...Object.keys(catMap).filter((c) => !CAT_ORDER.includes(c) && catMap[c]?.length),
    ];

    for (const cat of orderedCats) {
      if (SKIP_FOR_OWNER.has(cat)) continue;
      const cmds = catMap[cat];
      if (!cmds?.length) continue;
      const cfg = CAT_CFG[cat] || { e: "📌", n: cat.toUpperCase(), max: 8 };

      if (cat === "islamic") {
        const islamicEmoji = theme.catEmoji?.["islamic"] ?? "☪️";
        menu += theme.sectionBox(islamicEmoji, "ISLAMIC", cmds.length, [
          theme.cmdRow(pref, "islamicmenu", "Full Islamic command panel"),
          theme.infoRow("_Duas • Zikr • Hadith • Kalimas • Adhkar • Salah_"),
        ]);
        continue;
      }

      menu += renderCat(cfg.e, cfg.n, cmds, pref, cfg.max || 8, cat, theme);

      // After fun category — add GF / BF / AnimeDP / Adult extras
      if (cat === "fun") menu += buildFunExtras(pref, theme);
    }

    // Footer tips (themed)
    menu += theme.footer([
      `*${pref}menu download* — all download commands`,
      `*${pref}menu search*   — all AI & search commands`,
      `*${pref}menu fun*      — all fun & games`,
      ...(!isOwner ? [`*${pref}islamicmenu* — full Islamic panel`] : []),
      `*${pref}theme*         — change menu theme (${themeName})`,
    ]);

    menu += FOOTER;

    const banner = getBanner();
    const payload = banner
      ? { image: banner, caption: menu, mimetype: "image/jpeg" }
      : { text: menu };
    if (ctx) payload.contextInfo = ctx;

    try {
      await sock.sendMessage(jid, payload, { quoted: msg });
    } catch {
      const fallback = { text: menu };
      if (ctx) fallback.contextInfo = ctx;
      await sock.sendMessage(jid, fallback, { quoted: msg });
    }
  },
};
