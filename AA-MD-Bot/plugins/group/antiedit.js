// ============================================
// AA MD Bot - Anti Edit Plugin (FIXED v2 - with debug logging)
// Developer: Ahsan Ali Wadani
//
// WHAT WAS WRONG IN v1:
// 1. Edit detection ONLY trusted `protocolMsg.type === 14`. On some
//    Baileys/forks the numeric/enum value differs, so the check silently
//    failed and NOTHING happened — no error, no message, nothing.
// 2. `sock.sendMessage(...).catch(() => {})` swallowed every send error
//    (auth issues, bad jid, rate limit, etc). You'd never know it failed.
// 3. No logging anywhere, so there was no way to tell WHERE it broke:
//    listener never attached? event never fired? detection failed?
//    send failed? All looked identical from the outside: silence.
//
// THE FIX:
// - Detect edits primarily by the PRESENCE of `protocolMsg.editedMessage`
//   (this is present on every edit regardless of the `type` enum value/
//   naming across Baileys versions) — `type === 14` is now just a backup
//   signal, not the only one.
// - Every stage logs to console with an [AntiEdit] prefix so you can
//   watch your terminal/PM2 logs while testing and see exactly where it
//   stops working, if it ever does again.
// - sendMessage errors are now logged instead of swallowed.
//
// ⚠️ IMPORTANT — DO THIS TOO:
// The listener only attaches when `.antiedit` command RUNS. If the bot
// restarts, you must run `.antiedit on` again, OR (recommended) call
// `attachEditListener(sock, db)` directly in your connection.js right
// after the socket connects, e.g.:
//
//   import { attachEditListener } from './plugins/group/antiedit.js';
//   ...
//   sock.ev.on('connection.update', (update) => {
//     if (update.connection === 'open') {
//       attachEditListener(sock, db);
//     }
//   });
//
// This guarantees the listener is always live, even after reconnects,
// without needing anyone to type the command again.
// ============================================

// Try both common package names so a wrong import never silently breaks
// the whole plugin file from loading.
let proto;
try {
  ({ proto } = await import('baileys'));
} catch {
  try {
    ({ proto } = await import('@whiskeysockets/baileys'));
  } catch (e) {
    console.error('[AntiEdit] Could not import baileys proto — edit type enum fallback disabled:', e.message);
  }
}

import { saveNow } from '../../lib/database.js';

const LOG = (...args) => console.log('[AntiEdit]', ...args);

// ── In-memory message cache ───────────────────────────────────────────────
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

// ── Reliable edit detection ────────────────────────────────────────────
// Presence of `editedMessage` is the strongest, version-independent signal.
function isEditProtocolMessage(protocolMsg) {
  if (!protocolMsg) return false;
  if (protocolMsg.editedMessage) return true; // primary signal
  const t = protocolMsg.type;
  const enumVal = proto?.Message?.ProtocolMessage?.Type?.MESSAGE_EDIT;
  return t === 14 || t === 'MESSAGE_EDIT' || (enumVal !== undefined && t === enumVal);
}

const attachedSockets = new WeakSet();

export function attachEditListener(sock, db) {
  if (!sock?.ev) {
    console.error('[AntiEdit] sock.ev not found — this "sock" object is not the raw Baileys socket. ' +
      'Wire attachEditListener(sock, db) where you have the ACTUAL socket returned by makeWASocket().');
    return;
  }
  if (attachedSockets.has(sock)) {
    LOG('Listener already attached for this socket — skipping duplicate attach.');
    return;
  }
  attachedSockets.add(sock);
  LOG('Listener attached ✅ (messages.upsert)');

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;
        const isGroup = jid.endsWith('@g.us');
        const protocolMsg = m.message?.protocolMessage;

        if (protocolMsg) {
          LOG(`protocolMessage seen | type=${protocolMsg.type} | hasEditedMessage=${!!protocolMsg.editedMessage} | fromMe=${m.key.fromMe}`);

          const edit = isEditProtocolMessage(protocolMsg);

          if (edit && !m.key.fromMe) {
            const enabled = isAntiEditEnabled(db, jid, isGroup);
            LOG(`Edit detected in ${jid} | antiedit enabled = ${enabled}`);

            if (enabled) {
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

              const selfJid = selfJidOf(sock);
              LOG(`Sending report to self jid: ${selfJid}`);

              try {
                await sock.sendMessage(selfJid, { text });
                LOG('Report sent successfully ✅');
              } catch (sendErr) {
                console.error('[AntiEdit] FAILED to send report to self chat:', sendErr);
              }

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
          }
          continue; // never cache protocolMessage envelopes as normal text
        }

        // Normal message → cache it
        if (m.key.fromMe) continue;
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
        console.error('[AntiEdit] Error processing message:', e);
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
