// ============================================
// AA MD Bot - Anti Edit Plugin (FIXED & WORKING)
// Developer: Ahsan Ali Wadani
//
// ROOT CAUSE OF THE OLD BUG:
// The old file only had the `.antiedit on/off` command, which flipped a
// database flag — but NOTHING was ever listening for real WhatsApp edit
// events, so the flag was never actually read/used. Nothing could ever
// reach your (You) chat because no listener existed at all.
//
// HOW THIS FIXED VERSION WORKS:
// 1. Every incoming message is cached in-memory: id → { text, sender, ts }
// 2. WhatsApp delivers an edit as a NEW event: a `protocolMessage` with
//    type MESSAGE_EDIT, whose `key.id` points back at the ORIGINAL
//    message's id, and whose `editedMessage` holds the NEW content.
// 3. We look the original id up in our cache, and — if anti-edit is ON for
//    that chat — send the ORIGINAL text (plus the new text, for context)
//    to your own number's self chat ("You"), exactly like Anti Delete does.
//
// The listener attaches itself to `sock.ev` automatically, the very first
// time the `.antiedit` command runs (attachment happens synchronously
// before the "ON ✅" reply is even sent) — and only once per connection,
// guarded so reconnects/plugin-reloads never double-fire it.
//
// ⚠️ NOTE: if the bot restarts while antiedit was already ON from before,
// run `.antiedit on` once again after the restart so the listener attaches
// for the new connection (or wire attachEditListener(sock, db) into your
// main connection.js right after the socket is created, for guaranteed
// coverage from boot — this file works standalone either way).
// ============================================
import { proto } from '@whiskeysockets/baileys'; // change to 'baileys' if that's the package name you use
import { saveNow } from '../../lib/database.js';

// ── In-memory message cache ───────────────────────────────────────────────
// key: `${jid}:${id}` → { text, jid, sender, pushName, isGroup, ts }
const MAX_CACHE = 3000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const messageCache = new Map();

const cacheKey = (jid, id) => `${jid}:${id}`;

function pruneCache() {
  if (messageCache.size <= MAX_CACHE) return;
  const now = Date.now();
  for (const [k, v] of messageCache) {
    if (now - v.ts > CACHE_TTL_MS) messageCache.delete(k);
  }
  while (messageCache.size > MAX_CACHE) {
    messageCache.delete(messageCache.keys().next().value);
  }
}

// ── Extract plain text from any message type we care about ────────────────
function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    ''
  ).trim();
}

// ── Resolve anti-edit setting for a chat — same rules as the command ──────
function isAntiEditEnabled(db, jid, isGroup) {
  if (isGroup) {
    return (
      db.groups.get(jid)?.antiedit ??
      db.settings.getValue('antiedit') ??
      db.settings.getValue('antiEdit') ??
      false
    );
  }
  return db.settings.getValue('antiedit') ?? db.settings.getValue('antiEdit') ?? false;
}

function selfJidOf(sock) {
  const raw = sock.user?.id || sock.user?.jid || '';
  return raw.split(':')[0] + '@s.whatsapp.net';
}

// ── Attach the messages.upsert listener exactly ONCE per socket ───────────
const attachedSockets = new WeakSet();

export function attachEditListener(sock, db) {
  if (!sock?.ev || attachedSockets.has(sock)) return;
  attachedSockets.add(sock);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;
        const isGroup = jid.endsWith('@g.us');
        const protocolMsg = m.message?.protocolMessage;

        // ── Any protocolMessage (edit / revoke / etc.) — handle & skip caching ──
        if (protocolMsg) {
          const isEdit =
            protocolMsg.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT ||
            protocolMsg.type === 14;

          if (isEdit && !m.key.fromMe && isAntiEditEnabled(db, jid, isGroup)) {
            const originalId = protocolMsg.key?.id;
            const cached = originalId ? messageCache.get(cacheKey(jid, originalId)) : null;
            const newText = extractText(protocolMsg.editedMessage) || '(non-text content)';

            const senderJid = m.key.participant || m.key.remoteJid;
            const senderName = m.pushName || senderJid.split('@')[0];

            let chatLabel = `DM (${senderJid.split('@')[0]})`;
            if (isGroup) {
              const groupName = await sock.groupMetadata(jid).then((g) => g.subject).catch(() => jid);
              chatLabel = `Group: ${groupName}`;
            }

            const text =
              `✏️ *EDITED MESSAGE DETECTED*\n\n` +
              `👤 *From:* ${senderName} (${senderJid.split('@')[0]})\n` +
              `💬 *Chat:* ${chatLabel}\n\n` +
              `🔴 *Original:*\n${cached?.text ? cached.text : '_(not cached / unavailable)_'}\n\n` +
              `🟢 *Edited to:*\n${newText}`;

            await sock.sendMessage(selfJidOf(sock), { text }).catch(() => {});

            // keep cache in sync so a 2nd edit on the same message still diffs correctly
            if (originalId) {
              messageCache.set(cacheKey(jid, originalId), {
                text: newText,
                jid,
                sender: senderJid,
                pushName: senderName,
                isGroup,
                ts: Date.now(),
              });
            }
          }
          continue; // never cache protocolMessage envelopes as normal text
        }

        // ── Normal message → cache it for future edit detection ──────────
        if (m.key.fromMe) continue; // no need to cache our own outgoing msgs
        const text = extractText(m.message);
        if (!text || !m.key.id) continue;

        messageCache.set(cacheKey(jid, m.key.id), {
          text,
          jid,
          sender: m.key.participant || m.key.remoteJid,
          pushName: m.pushName || '',
          isGroup,
          ts: Date.now(),
        });
        pruneCache();
      } catch (e) {
        console.error('[AntiEdit]', e.message);
      }
    }
  });
}

export default {
  command: 'antiedit',
  alias: ['antieditmsg', 'noedit', 'editguard'],
  description: 'Recover original messages when someone edits them',
  category: 'group',
  usage: '.antiedit on/off',
  async execute({ sock, reply, jid, args, isOwner, isGroupMsg, db }) {
    // Safe to call every time — only actually attaches once per connection.
    attachEditListener(sock, db);

    const toggle = args[0]?.toLowerCase();
    const currentVal = isGroupMsg
      ? (db.groups.get(jid)?.antiedit ?? db.settings.getValue('antiedit') ?? db.settings.getValue('antiEdit') ?? false)
      : (db.settings.getValue('antiedit') ?? db.settings.getValue('antiEdit') ?? false);
    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `✏️ *Anti Edit* is currently *${currentVal ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*.antiedit on*  — Send old version of edited messages to (You) chat\n` +
        `*.antiedit off* — Ignore edited messages\n\n` +
        (isGroupMsg
          ? `📌 Applies to *this group only*`
          : `📌 From DM → applies *globally* to all groups & DMs`)
      );
    }
    const value = toggle === 'on';
    if (isGroupMsg) {
      const group = db.groups.get(jid) || {};
      db.groups.set(jid, { ...group, antiedit: value });
      await saveNow('groups');
      return reply(
        `✏️ *Anti Edit* is now *${value ? 'ON ✅' : 'OFF ❌'}* for this group.\n` +
        (value ? 'Edited messages will be recovered in your (You) chat.' : 'Edited messages will be ignored.')
      );
    }
    if (!isOwner) return reply('⚠️ Only the bot owner can set global anti-edit from DM.');
    db.settings.setValue('antiedit', value);
    db.settings.setValue('antiEdit', value);
    await saveNow('settings');
    return reply(
      `✏️ *Anti Edit* globally set to *${value ? 'ON ✅' : 'OFF ❌'}*.\n` +
      (value
        ? 'Old versions of edited messages will be sent to your (You) chat.'
        : 'Anti-edit disabled globally.')
    );
  },
};
