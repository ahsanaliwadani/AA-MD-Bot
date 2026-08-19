// ============================================
// AA MD Bot - Anti Edit Plugin (FULLY FIXED)
// Developer: Ahsan Ali Wadani
// ============================================

import { saveNow } from '../../lib/database.js';

let jidNormalizedUser = (jid) => (jid ? jid.split('@')[0].split(':')[0] + '@s.whatsapp.net' : '');
let proto;

try {
  const baileys = await import('baileys');
  proto = baileys.proto;
  if (baileys.jidNormalizedUser) jidNormalizedUser = baileys.jidNormalizedUser;
} catch {
  try {
    const baileys = await import('@whiskeysockets/baileys');
    proto = baileys.proto;
    if (baileys.jidNormalizedUser) jidNormalizedUser = baileys.jidNormalizedUser;
  } catch (e) {
    console.error('[AntiEdit] Baileys import fallback notice:', e.message);
  }
}

const LOG = (...args) => console.log('[AntiEdit]', ...args);

// ── Cache Settings ──────────────────────────────────────────────────
const MAX_CACHE = 5000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 Hours
const messageCache = new Map();

// JID Cleaner (Strips device suffix like :12)
function cleanJid(jid) {
  if (!jid) return '';
  const base = jid.split(':')[0].split('@')[0];
  return jid.includes('@g.us') ? `${base}@g.us` : `${base}@s.whatsapp.net`;
}

// Extract Bot Owner's JID reliably
function getSelfJid(sock) {
  try {
    const raw = sock?.user?.id || sock?.user?.jid || sock?.user?.phone || '';
    if (!raw) return null;
    const cleanNumber = raw.split(':')[0].split('@')[0];
    return `${cleanNumber}@s.whatsapp.net`;
  } catch {
    return null;
  }
}

// Deep text extractor for edited & wrapped messages
function extractText(msg) {
  if (!msg) return '';
  
  let m = msg;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  if (m.editedMessage) m = m.editedMessage.message || m.editedMessage;

  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.protocolMessage?.editedMessage?.conversation ||
    m?.protocolMessage?.editedMessage?.extendedTextMessage?.text ||
    ''
  ).trim();
}

// Safe DB Check
function isAntiEditEnabled(db, jid, isGroup) {
  try {
    if (!db) return true;
    if (isGroup) {
      const groupObj = typeof db.groups?.get === 'function' ? db.groups.get(jid) : db.groups?.[jid];
      if (groupObj?.antiedit !== undefined) return Boolean(groupObj.antiedit);
    }
    const val = typeof db.settings?.getValue === 'function' 
      ? (db.settings.getValue('antiedit') ?? db.settings.getValue('antiEdit'))
      : (db.settings?.antiedit ?? db.settings?.antiEdit);
    
    return val !== undefined ? Boolean(val) : true;
  } catch (e) {
    return true;
  }
}

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

// Core function to process detected edits
async function processEditMessage(sock, db, m, protocolMsg) {
  try {
    const rawJid = m.key?.remoteJid || protocolMsg?.key?.remoteJid;
    if (!rawJid || rawJid === 'status@broadcast') return;

    const jid = cleanJid(rawJid);
    const isGroup = jid.endsWith('@g.us');

    const enabled = isAntiEditEnabled(db, jid, isGroup);
    LOG(`Edit event detected in ${jid} | AntiEdit Enabled: ${enabled}`);

    if (!enabled) return;

    const targetId = protocolMsg?.key?.id;
    if (!targetId) return;

    // Fast cache lookup
    const cacheKey = `${jid}:${targetId}`;
    const cached = messageCache.get(cacheKey) || messageCache.get(targetId);

    const newText = extractText(protocolMsg?.editedMessage) || extractText(m.message) || '(Non-text content / Media)';
    const senderJid = cleanJid(m.key?.participant || protocolMsg?.key?.participant || rawJid);
    const senderName = m.pushName || senderJid.split('@')[0];

    let chatLabel = `DM (${senderJid.split('@')[0]})`;
    if (isGroup) {
      let groupName = jid;
      try {
        const metadata = await sock.groupMetadata(jid);
        if (metadata?.subject) groupName = metadata.subject;
      } catch {}
      chatLabel = `Group: ${groupName}`;
    }

    const oldText = cached?.text || '_(Original message not captured in cache)_';

    const reportText = 
      `✏️ *EDITED MESSAGE DETECTED*\n\n` +
      `👤 *From:* ${senderName} (@${senderJid.split('@')[0]})\n` +
      `💬 *Chat:* ${chatLabel}\n\n` +
      `🔴 *Original Message:*\n${oldText}\n\n` +
      `🟢 *Edited Message:*\n${newText}`;

    const selfJid = getSelfJid(sock);
    LOG(`Target self chat JID: ${selfJid}`);

    if (selfJid) {
      await sock.sendMessage(selfJid, {
        text: reportText,
        mentions: [senderJid]
      });
      LOG('✅ AntiEdit report successfully sent to Self Chat!');
    } else {
      console.error('[AntiEdit] Could not determine bot owner JID to send report.');
    }

    // Update cache with edited version
    messageCache.set(cacheKey, {
      text: newText,
      jid,
      sender: senderJid,
      pushName: senderName,
      isGroup,
      ts: Date.now()
    });

  } catch (err) {
    console.error('[AntiEdit] Error handling edit message:', err);
  }
}

const attachedSockets = new WeakSet();

export function attachEditListener(sock, db) {
  if (!sock?.ev) return;
  if (attachedSockets.has(sock)) return;
  attachedSockets.add(sock);
  LOG('AntiEdit listener attached successfully ✅');

  // 1. Listen for new incoming messages (Upsert)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const m of messages) {
      try {
        if (!m.message) continue;

        const rawJid = m.key?.remoteJid;
        if (!rawJid || rawJid === 'status@broadcast') continue;

        const jid = cleanJid(rawJid);
        const isGroup = jid.endsWith('@g.us');
        const msgId = m.key?.id;

        const protocolMsg = m.message?.protocolMessage || m.message?.ephemeralMessage?.message?.protocolMessage;
        const isEdit = protocolMsg && (
          protocolMsg.editedMessage ||
          protocolMsg.type === 14 ||
          protocolMsg.type === 'MESSAGE_EDIT' ||
          protocolMsg.type === proto?.Message?.ProtocolMessage?.Type?.MESSAGE_EDIT
        );

        // Process if message is an Edit
        if (isEdit) {
          if (m.key?.fromMe) continue; // Ignore edits made by the bot itself
          await processEditMessage(sock, db, m, protocolMsg);
          continue;
        }

        // Save incoming normal messages into Cache
        if (!m.key?.fromMe) {
          const text = extractText(m.message);
          if (text && msgId) {
            const item = {
              text,
              jid,
              sender: cleanJid(m.key.participant || rawJid),
              pushName: m.pushName || '',
              isGroup,
              ts: Date.now()
            };

            messageCache.set(`${jid}:${msgId}`, item);
            messageCache.set(msgId, item);
            pruneCache();
          }
        }
      } catch (e) {
        console.error('[AntiEdit] Error in upsert listener:', e);
      }
    }
  });

  // 2. Listen for message update events (Baileys edit push handler)
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        const protocolMsg = update.update?.message?.protocolMessage;
        if (protocolMsg && (protocolMsg.type === 14 || protocolMsg.editedMessage)) {
          if (update.key?.fromMe) continue;
          await processEditMessage(sock, db, update, protocolMsg);
        }
      } catch (e) {
        console.error('[AntiEdit] Error in update listener:', e);
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
    let currentVal = false;
    try {
      currentVal = isGroupMsg
        ? (db.groups?.get?.(jid)?.antiedit ?? db.groups?.[jid]?.antiedit ?? db.settings?.getValue?.('antiedit') ?? false)
        : (db.settings?.getValue?.('antiedit') ?? db.settings?.antiedit ?? false);
    } catch {}

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `✏️ *Anti Edit* is currently *${currentVal ? 'ON ✅' : 'OFF ❌'}*\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*.antiedit on*  — Send old version of edited messages to Self Chat\n` +
        `*.antiedit off* — Ignore edited messages\n\n` +
        (isGroupMsg
          ? `📌 Applies to *this group only*`
          : `📌 Applies *globally* to all groups & DMs`)
      );
    }

    const value = toggle === 'on';

    if (isGroupMsg) {
      if (typeof db.groups?.get === 'function') {
        const group = db.groups.get(jid) || {};
        db.groups.set(jid, { ...group, antiedit: value });
      } else if (db.groups) {
        db.groups[jid] = { ...(db.groups[jid] || {}), antiedit: value };
      }
      if (typeof saveNow === 'function') await saveNow('groups');

      return reply(
        `✏️ *Anti Edit* is now *${value ? 'ON ✅' : 'OFF ❌'}* for this group.\n` +
        (value ? 'Edited messages will be sent to your Self Chat.' : 'Edited messages will be ignored.')
      );
    }

    if (!isOwner) return reply('⚠️ Only the bot owner can set global anti-edit.');

    if (typeof db.settings?.setValue === 'function') {
      db.settings.setValue('antiedit', value);
      db.settings.setValue('antiEdit', value);
    } else if (db.settings) {
      db.settings.antiedit = value;
      db.settings.antiEdit = value;
    }
    if (typeof saveNow === 'function') await saveNow('settings');

    return reply(
      `✏️ *Anti Edit* globally set to *${value ? 'ON ✅' : 'OFF ❌'}*.\n` +
      (value ? 'Old versions of edited messages will be sent to your Self Chat.' : 'Anti-edit disabled globally.')
    );
  },
};
