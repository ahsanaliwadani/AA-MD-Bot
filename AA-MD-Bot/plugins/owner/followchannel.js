// ============================================
// AA MD Bot - Follow Channel Manager (Super Owner)
// Whenever a WhatsApp number connects to the bot, it auto-follows every
// channel in this list. SuperOwner can also force-follow on ALL currently
// connected sessions instantly via .followchannel followall
// ============================================

import {
  getFollowChannels, addFollowChannel, removeFollowChannel,
  replaceFollowChannels, clearFollowChannels, followAllChannels,
} from '../../lib/channelFollow.js';
import { sessions, sessionStatus } from '../../lib/sessionManager.js';

// Helper — run followAllChannels on every connected session right now
async function pushToAllSessions() {
  const results = { ok: 0, fail: 0, skipped: 0 };
  for (const [sid, sock] of sessions.entries()) {
    if (sessionStatus.get(sid) !== 'connected') { results.skipped++; continue; }
    try {
      await followAllChannels(sock);
      results.ok++;
    } catch {
      results.fail++;
    }
  }
  return results;
}

export default {
  command: 'followchannel',
  alias: ['followchannels', 'autofollow', 'channellist'],
  description: 'Manage WhatsApp channels auto-followed on connect (super owner)',
  category: 'owner',
  ownerOnly: true,
  superOwnerOnly: true,
  usage:
    '.followchannel — list channels\n' +
    '.followchannel add <link> — add channel + instantly follow on all connected numbers\n' +
    '.followchannel set <link> — replace list + instantly follow on all connected numbers\n' +
    '.followchannel remove <number> — remove a channel\n' +
    '.followchannel followall — force follow all channels on every connected number now\n' +
    '.followchannel clear — remove all channels',

  async execute({ reply, args }) {
    const sub = (args[0] || 'list').toLowerCase();

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list' || !args.length) {
      const list = getFollowChannels();
      if (!list.length) {
        return reply('📢 *Auto-Follow Channels*\n\nNo channels configured.\nUse *.followchannel add <link>*.');
      }
      const connectedCount = [...(sessionStatus?.entries() || [])].filter(([, s]) => s === 'connected').length;
      const lines = list.map((c, i) => `${i + 1}. ${c.link}${c.jid ? ' ✅' : ''}`).join('\n');
      return reply(
        `📢 *Auto-Follow Channels*\n\n${lines}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🔌 Connected sessions: *${connectedCount}*\n\n` +
        `*.followchannel add <link>* — add & follow now\n` +
        `*.followchannel set <link>* — replace all & follow now\n` +
        `*.followchannel followall* — push to all connected now\n` +
        `*.followchannel remove <number>* — remove one\n` +
        `*.followchannel clear* — remove all`
      );
    }

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const link = args[1];
      if (!link) return reply('❌ Usage: *.followchannel add <channel link>*');
      const res = addFollowChannel(link);
      if (!res.ok) return reply(`❌ ${res.error}`);

      await reply(`✅ *Channel Added!*\n\n📢 ${link}\n\n⏳ Pushing follow to all connected numbers…`);

      const r = await pushToAllSessions();
      return reply(
        `📢 *Channel Follow — Done!*\n\n` +
        `✅ Followed on: *${r.ok}* session(s)\n` +
        `⏭️ Skipped (offline): *${r.skipped}*\n` +
        `❌ Failed: *${r.fail}*\n\n` +
        `New numbers that connect later will also auto-follow it.`
      );
    }

    // ── SET / REPLACE ─────────────────────────────────────────────────────────
    if (sub === 'set' || sub === 'change' || sub === 'replace') {
      const link = args[1];
      if (!link) return reply('❌ Usage: *.followchannel set <channel link>*');
      const res = replaceFollowChannels(link);
      if (!res.ok) return reply(`❌ ${res.error}`);

      await reply(`✅ *Channel List Replaced!*\n\n📢 ${link}\n\n⏳ Pushing follow to all connected numbers…`);

      const r = await pushToAllSessions();
      return reply(
        `📢 *Channel Follow — Done!*\n\n` +
        `✅ Followed on: *${r.ok}* session(s)\n` +
        `⏭️ Skipped (offline): *${r.skipped}*\n` +
        `❌ Failed: *${r.fail}*\n\n` +
        `New numbers that connect later will also auto-follow it.`
      );
    }

    // ── FOLLOWALL — force push right now ─────────────────────────────────────
    if (sub === 'followall' || sub === 'push' || sub === 'force') {
      const list = getFollowChannels();
      if (!list.length) return reply('❌ No channels configured. Add one first with *.followchannel add <link>*');

      await reply(`⏳ Pushing ${list.length} channel(s) to all connected sessions…`);

      const r = await pushToAllSessions();
      return reply(
        `📢 *Force Follow — Done!*\n\n` +
        `✅ Followed on: *${r.ok}* session(s)\n` +
        `⏭️ Skipped (offline): *${r.skipped}*\n` +
        `❌ Failed: *${r.fail}*`
      );
    }

    // ── REMOVE ───────────────────────────────────────────────────────────────
    if (sub === 'remove' || sub === 'delete' || sub === 'del') {
      const idx = parseInt(args[1], 10) - 1;
      if (isNaN(idx)) return reply('❌ Usage: *.followchannel remove <number>*\n\nUse *.followchannel* to see the numbered list.');
      const res = removeFollowChannel(idx);
      if (!res.ok) return reply(`❌ ${res.error}`);
      return reply(`✅ *Channel Removed!*\n\n📢 ${res.removed.link}\n\n📋 Remaining: ${res.list.length}`);
    }

    // ── CLEAR ─────────────────────────────────────────────────────────────────
    if (sub === 'clear') {
      clearFollowChannels();
      return reply('✅ All auto-follow channels cleared.');
    }

    return reply('❌ Unknown option.\n\nUse: *list, add, set, followall, remove, clear*');
  },
};
