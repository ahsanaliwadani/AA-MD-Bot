// ============================================
// AA MD Bot — Status Saver
// Developer: Ahsan Ali | AA Mods
//
// How it works:
//  1. Owner enables with .statussave on
//  2. Bot auto-downloads every contact's status as it arrives
//  3. Owner uses .statussave list  → numbered list of saved statuses
//  4. Owner uses .statussave <N>   → sends that status to owner DM
//  5. Owner uses .statussave all   → sends all saved statuses
//
// NOTE: WhatsApp does NOT allow forwarding/quoting statuses through the
// bot — they must be downloaded in real-time when they arrive.
// ============================================

import {
  getStatusCollection,
  clearStatusCollection,
} from '../../lib/sessionManager.js';

const FOOTER = '\n\n> 💾 *AA MD Bot* • 📲 *Status Saver*';

function fmt(ms) {
  const d = new Date(ms);
  return d.toLocaleString('en-PK', { timeZone: 'Asia/Karachi',
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default {
  command:     'statussave',
  alias:       ['savestatus', 'statusdl', 'svs', 'dlstatus', 'statusview'],
  description: 'Auto-save contact statuses as they arrive',
  category:    'gb',

  async execute({ reply, react, sock, jid, msg, args, isOwner, sessionId, db, sessionSettings }) {
    const sub = (args[0] || '').toLowerCase();

    // ── STATUS / NO ARG ───────────────────────────────────────────────────────
    if (!sub || sub === 'status' || sub === 'info') {
      const isOn = sessionSettings.get('statusSave') ?? db.settings.getValue('statusSave') ?? false;
      const coll = getStatusCollection(sessionId);

      return reply(
        `💾 *Status Saver*\n\n` +
        `Status: *${isOn ? 'ON ✅' : 'OFF ❌'}*\n` +
        `Saved: *${coll.size}* status(es) in memory\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*Commands:*\n` +
        `▸ *.statussave on*    — Enable auto-save\n` +
        `▸ *.statussave off*   — Disable auto-save\n` +
        `▸ *.statussave list*  — List saved statuses\n` +
        `▸ *.statussave <N>*   — Get status number N\n` +
        `▸ *.statussave all*   — Send all saved statuses\n` +
        `▸ *.statussave clear* — Clear saved statuses\n\n` +
        `📌 *How it works:*\n` +
        `When enabled, bot automatically downloads every contact's status (photo/video/text) when it arrives. WhatsApp doesn't allow sharing statuses directly — the bot captures them in real-time.\n\n` +
        `⚡ Statuses are stored in *memory* (cleared on bot restart).${FOOTER}`
      );
    }

    // ── ON ────────────────────────────────────────────────────────────────────
    if (sub === 'on' || sub === 'enable') {
      if (!isOwner) return reply('❌ Only the bot owner can enable Status Saver.');
      if (sessionSettings.get('statusSave')) return reply('✅ Status Saver is already *ON*.');
      sessionSettings.set('statusSave', true);
      await react('✅');
      return reply(
        `✅ *Status Saver ENABLED!*\n\n` +
        `Bot will now automatically download every contact's status as it arrives.\n\n` +
        `Use *.statussave list* to see saved statuses.\n\n` +
        `⚡ Note: Statuses already posted before enabling won't be saved.${FOOTER}`
      );
    }

    // ── OFF ───────────────────────────────────────────────────────────────────
    if (sub === 'off' || sub === 'disable') {
      if (!isOwner) return reply('❌ Only the bot owner can toggle Status Saver.');
      sessionSettings.set('statusSave', false);
      await react('✅');
      return reply(`❌ *Status Saver DISABLED.*${FOOTER}`);
    }

    // ── CLEAR ─────────────────────────────────────────────────────────────────
    if (sub === 'clear') {
      if (!isOwner) return reply('❌ Only the bot owner can clear statuses.');
      clearStatusCollection(sessionId);
      await react('✅');
      return reply(`🗑️ *Status collection cleared.*${FOOTER}`);
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (sub === 'list' || sub === 'show' || sub === 'ls') {
      const coll = getStatusCollection(sessionId);
      if (!coll.size) {
        return reply(
          `📭 *No saved statuses yet.*\n\n` +
          `Make sure *.statussave on* is enabled.\n` +
          `Statuses will be saved as contacts post them.${FOOTER}`
        );
      }

      const entries = [...coll.entries()].reverse(); // newest first
      const lines   = entries.slice(0, 30).map(([id, e], i) => {
        const num    = i + 1;
        const name   = e.pushName ? `*${e.pushName}*` : `+${e.senderNum}`;
        const type   = e.isVideo ? '🎬 Video' : e.isAudio ? '🎵 Audio' : e.text ? '📝 Text' : '🖼️ Photo';
        const status = e.buffer ? '✅' : e.text ? '📝' : '⚠️ no buffer';
        return `${num}. ${name} — ${type} ${status} — ${fmt(e.time)}`;
      });

      return reply(
        `💾 *Saved Statuses (${coll.size} total)*\n\n` +
        lines.join('\n') +
        `\n\n_Use *.statussave <number>* to get a status_\n` +
        `_Use *.statussave all* to send all_${FOOTER}`
      );
    }

    // ── ALL ───────────────────────────────────────────────────────────────────
    if (sub === 'all') {
      if (!isOwner) return reply('❌ Only the bot owner can use this.');
      const coll = getStatusCollection(sessionId);
      if (!coll.size) {
        return reply(`📭 *No saved statuses yet.* Enable with *.statussave on*${FOOTER}`);
      }

      const entries = [...coll.entries()].reverse();
      const limit   = Math.min(entries.length, 15); // max 15 at once
      await react('📤');
      await reply(`📤 _Sending ${limit} saved statuses..._`);

      let sent = 0, failed = 0;
      for (let i = 0; i < limit; i++) {
        const [, e] = entries[i];
        try {
          await sendStatusEntry(sock, jid, msg, e);
          sent++;
          await new Promise(r => setTimeout(r, 500)); // small delay between sends
        } catch { failed++; }
      }

      await react('✅');
      return reply(
        `✅ *Sent ${sent}/${limit} statuses*${failed ? ` (${failed} failed)` : ''}${FOOTER}`
      );
    }

    // ── NUMBER (get specific status) ──────────────────────────────────────────
    const num = parseInt(sub, 10);
    if (!isNaN(num) && num >= 1) {
      const coll    = getStatusCollection(sessionId);
      const entries = [...coll.entries()].reverse(); // newest first
      if (num > entries.length) {
        return reply(
          `❌ Only *${entries.length}* statuses saved. Use *.statussave list* to see them.${FOOTER}`
        );
      }
      const [, entry] = entries[num - 1];
      await react('📤');
      try {
        await sendStatusEntry(sock, jid, msg, entry);
        await react('✅');
      } catch (err) {
        await react('❌');
        reply(`❌ Failed to send status: ${err.message?.slice(0, 80)}${FOOTER}`);
      }
      return;
    }

    // ── UNKNOWN ───────────────────────────────────────────────────────────────
    return reply(`❓ Unknown option. Use: *.statussave on/off/list/all/clear/<number>*${FOOTER}`);
  },
};

// ── Helper: send one status entry to a chat ───────────────────────────────────
async function sendStatusEntry(sock, jid, quotedMsg, entry) {
  const name = entry.pushName ? `*${entry.pushName}*` : `+${entry.senderNum}`;
  const time = fmt(entry.time);

  if (entry.text) {
    await sock.sendMessage(jid, {
      text: `💾 *Status from ${name}*\n🕐 ${time}\n\n📝 ${entry.text}`,
    }, { quoted: quotedMsg });
    return;
  }

  if (!entry.buffer || !entry.buffer.length) {
    await sock.sendMessage(jid, {
      text: `⚠️ *Status from ${name}* (${time})\n\n_Media buffer not available_\n_(Status may have expired)_`,
    }, { quoted: quotedMsg });
    return;
  }

  const caption = `💾 *Status from ${name}*\n🕐 ${time}`;

  if (entry.isVideo) {
    await sock.sendMessage(jid, {
      video:   entry.buffer,
      mimetype: entry.mimetype || 'video/mp4',
      caption,
    }, { quoted: quotedMsg });
  } else if (entry.isAudio) {
    await sock.sendMessage(jid, {
      audio:    entry.buffer,
      mimetype: entry.mimetype || 'audio/ogg; codecs=opus',
      ptt:      false,
    }, { quoted: quotedMsg });
  } else {
    await sock.sendMessage(jid, {
      image:   entry.buffer,
      mimetype: entry.mimetype || 'image/jpeg',
      caption,
    }, { quoted: quotedMsg });
  }
}
