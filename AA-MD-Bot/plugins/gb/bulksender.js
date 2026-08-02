// ============================================
// AA MD Bot - Bulk Sender (GB WhatsApp Feature)
// Bulk Message / Bulk Image / Bulk Document sender
// Owner-only. Sends sequentially with delay + a
// per-recipient cap to reduce spam/ban risk.
// ============================================
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { generateId } from "../../lib/helper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "../../temp");

// Safety limits — keep these sane to avoid the connected number getting
// flagged/banned by WhatsApp for spam-like sending behavior.
const MAX_RECIPIENTS = 50;
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 4000;
const PROGRESS_EVERY = 10;

/* ─────────────────────────────── HELPERS ─────────────────────────────── */

function resolveOwnerFlag(ctx) {
  return !!(ctx.isOwner ?? ctx.owner ?? ctx.fromMe ?? false);
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function randomDelay() {
  return delay(
    MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)),
  );
}

/**
 * parseRecipients
 * Accepts numbers separated by commas, spaces, or newlines. Also accepts
 * already-formed JIDs (user@s.whatsapp.net or group@g.us) untouched.
 * Returns { jids: string[], invalid: string[] }.
 */
function parseRecipients(raw) {
  const tokens = raw
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const jids = [];
  const invalid = [];
  const seen = new Set();

  for (const token of tokens) {
    let jid = null;

    if (/^\d+@(s\.whatsapp\.net|g\.us)$/i.test(token)) {
      jid = token;
    } else {
      const digits = token.replace(/[^\d]/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        jid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!jid) {
      invalid.push(token);
      continue;
    }
    if (seen.has(jid)) continue;
    seen.add(jid);
    jids.push(jid);
  }

  return { jids, invalid };
}

/** getTargetMessage: reads the quoted message (the media to bulk-send). */
function getTargetMessage(msg) {
  const quotedInfo = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = quotedInfo?.quotedMessage;
  if (quoted) {
    return {
      message: quoted,
      key: {
        remoteJid: msg.key.remoteJid,
        id: quotedInfo.stanzaId,
        participant: quotedInfo.participant,
        fromMe: quotedInfo.participant
          ? quotedInfo.participant === msg.key.participant
          : msg.key.fromMe,
      },
    };
  }
  return null;
}

/**
 * splitCommandArg
 * Splits ".bulk <sub> <recipients> | <extra>" into { recipients, extra }.
 * The pipe "|" separates the recipient list from the message/caption text.
 */
function splitCommandArg(rest) {
  const pipeIndex = rest.indexOf("|");
  if (pipeIndex === -1) return { recipients: rest.trim(), extra: "" };
  return {
    recipients: rest.slice(0, pipeIndex).trim(),
    extra: rest.slice(pipeIndex + 1).trim(),
  };
}

/** buildSummary: formats the final success/fail report. */
function buildSummary(title, total, sent, failed) {
  let text = `✅ *${title} Complete*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📦 Total: ${total}\n`;
  text += `✅ Sent: ${sent.length}\n`;
  text += `❌ Failed: ${failed.length}\n`;
  if (failed.length) {
    text += `\n*Failed recipients:*\n`;
    text += failed
      .slice(0, 15)
      .map((f) => `▸ ${f.jid.split("@")[0]} — ${f.reason}`)
      .join("\n");
    if (failed.length > 15) text += `\n_...and ${failed.length - 15} more_`;
  }
  text += `\n\n> 🤖 *Powered by AA MD Bot*`;
  return text;
}

/**
 * runBulkSend
 * Core sequential sender shared by all three subcommands.
 * `contentPerRecipient` is a function(jid) -> Baileys message content object.
 */
async function runBulkSend({ sock, reply }, jids, title, contentPerRecipient) {
  const sent = [];
  const failed = [];

  for (let i = 0; i < jids.length; i++) {
    const target = jids[i];
    try {
      const content = await contentPerRecipient(target);
      await sock.sendMessage(target, content);
      sent.push(target);
    } catch (err) {
      failed.push({
        jid: target,
        reason: String(err?.message || err).slice(0, 80),
      });
    }

    if ((i + 1) % PROGRESS_EVERY === 0 && i + 1 < jids.length) {
      await reply(
        `⏳ *${title} progress:* ${i + 1}/${jids.length} processed...`,
      );
    }

    if (i < jids.length - 1) await randomDelay();
  }

  return { sent, failed };
}

/* ─────────────────────────────── SUBCOMMANDS ─────────────────────────────── */

async function handleBulkMessage({ sock, reply }, rest) {
  const { recipients, extra } = splitCommandArg(rest);

  if (!recipients) {
    return reply(
      "❌ *Missing recipients.*\n\nUsage:\n*.bulk msg 923001234567,923009876543 | Your message here*",
    );
  }
  if (!extra) {
    return reply(
      "❌ *Missing message text.*\n\nUsage:\n*.bulk msg 923001234567,923009876543 | Your message here*",
    );
  }

  const { jids, invalid } = parseRecipients(recipients);

  if (jids.length === 0) {
    return reply(
      "❌ *No valid recipients found.*\nProvide numbers separated by commas, e.g. 923001234567,923009876543",
    );
  }
  if (jids.length > MAX_RECIPIENTS) {
    return reply(
      `❌ *Too many recipients.*\nMax allowed per command: *${MAX_RECIPIENTS}*. You provided: ${jids.length}.`,
    );
  }

  await reply(
    `⏳ *Bulk Message starting...*\n` +
      `📦 Recipients: ${jids.length}${invalid.length ? `\n⚠️ Skipped invalid: ${invalid.length}` : ""}\n` +
      `_This will take roughly ${Math.round((jids.length * (MIN_DELAY_MS + MAX_DELAY_MS)) / 2 / 1000)}s..._`,
  );

  const { sent, failed } = await runBulkSend(
    { sock, reply },
    jids,
    "Bulk Message",
    async () => ({ text: extra }),
  );

  return reply(buildSummary("Bulk Message", jids.length, sent, failed));
}

async function handleBulkImage({ sock, jid, msg, reply }, rest) {
  const { recipients, extra: caption } = splitCommandArg(rest);

  if (!recipients) {
    return reply(
      "❌ *Missing recipients.*\n\nUsage: reply to an image with:\n*.bulk image 923001234567,923009876543 | optional caption*",
    );
  }

  const target = getTargetMessage(msg);
  const imageMessage = target?.message?.imageMessage;
  if (!imageMessage) {
    return reply(
      "❌ *No image found.*\nReply to an *image* with *.bulk image <numbers>*.",
    );
  }

  const { jids, invalid } = parseRecipients(recipients);
  if (jids.length === 0) {
    return reply(
      "❌ *No valid recipients found.*\nProvide numbers separated by commas, e.g. 923001234567,923009876543",
    );
  }
  if (jids.length > MAX_RECIPIENTS) {
    return reply(
      `❌ *Too many recipients.*\nMax allowed per command: *${MAX_RECIPIENTS}*. You provided: ${jids.length}.`,
    );
  }

  await reply(
    `⏳ *Bulk Image starting...*\n` +
      `📦 Recipients: ${jids.length}${invalid.length ? `\n⚠️ Skipped invalid: ${invalid.length}` : ""}\n` +
      `_This will take roughly ${Math.round((jids.length * (MIN_DELAY_MS + MAX_DELAY_MS)) / 2 / 1000)}s..._`,
  );

  let buffer;
  try {
    const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
    buffer = await downloadMediaMessage(
      target,
      "buffer",
      {},
      { reuploadRequest: sock.updateMediaMessage },
    );
  } catch {
    return reply(
      "❌ *Failed to download the source image.* It may have expired.",
    );
  }

  const finalCaption = caption || imageMessage.caption || "";

  const { sent, failed } = await runBulkSend(
    { sock, reply },
    jids,
    "Bulk Image",
    async () => ({
      image: buffer,
      caption: finalCaption,
    }),
  );

  return reply(buildSummary("Bulk Image", jids.length, sent, failed));
}

async function handleBulkDocument({ sock, jid, msg, reply }, rest) {
  const { recipients, extra: caption } = splitCommandArg(rest);

  if (!recipients) {
    return reply(
      "❌ *Missing recipients.*\n\nUsage: reply to a document with:\n*.bulk doc 923001234567,923009876543 | optional caption*",
    );
  }

  const target = getTargetMessage(msg);
  const docMessage = target?.message?.documentMessage;
  if (!docMessage) {
    return reply(
      "❌ *No document found.*\nReply to a *document/file* with *.bulk doc <numbers>*.",
    );
  }

  const { jids, invalid } = parseRecipients(recipients);
  if (jids.length === 0) {
    return reply(
      "❌ *No valid recipients found.*\nProvide numbers separated by commas, e.g. 923001234567,923009876543",
    );
  }
  if (jids.length > MAX_RECIPIENTS) {
    return reply(
      `❌ *Too many recipients.*\nMax allowed per command: *${MAX_RECIPIENTS}*. You provided: ${jids.length}.`,
    );
  }

  await reply(
    `⏳ *Bulk Document starting...*\n` +
      `📦 Recipients: ${jids.length}${invalid.length ? `\n⚠️ Skipped invalid: ${invalid.length}` : ""}\n` +
      `_This will take roughly ${Math.round((jids.length * (MIN_DELAY_MS + MAX_DELAY_MS)) / 2 / 1000)}s..._`,
  );

  let buffer;
  try {
    const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
    buffer = await downloadMediaMessage(
      target,
      "buffer",
      {},
      { reuploadRequest: sock.updateMediaMessage },
    );
  } catch {
    return reply(
      "❌ *Failed to download the source document.* It may have expired.",
    );
  }

  const fileName = docMessage.fileName || `Document_${generateId()}`;
  const mimetype = docMessage.mimetype || "application/octet-stream";
  const finalCaption = caption || "";

  const { sent, failed } = await runBulkSend(
    { sock, reply },
    jids,
    "Bulk Document",
    async () => ({
      document: buffer,
      fileName,
      mimetype,
      caption: finalCaption,
    }),
  );

  return reply(buildSummary("Bulk Document", jids.length, sent, failed));
}

/* ─────────────────────────────── PLUGIN ─────────────────────────────── */

export default {
  command: "bulk",
  alias: ["blast", "bulksend", "bulkmsg"],
  description:
    "Bulk sender — send a message, image, or document to multiple numbers at once",
  category: "owner",
  usage:
    ".bulk msg <numbers> | <message>\n" +
    ".bulk image <numbers> | <caption>   (reply to an image)\n" +
    ".bulk doc <numbers> | <caption>     (reply to a document)",
  ownerOnly: true,
  async execute(ctx) {
    const { reply, args } = ctx;
    const isOwnerFlag = resolveOwnerFlag(ctx);

    // Defense in depth: enforce owner-only here too, in case the framework's
    // declarative `ownerOnly: true` isn't wired up for every loader path.
    if (!isOwnerFlag) {
      return reply(
        "❌ *Owner Only*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nThis command can only be used by the bot owner.",
      );
    }

    const sub = (args[0] || "").toLowerCase();
    const rest = args.slice(1).join(" ").trim();

    try {
      switch (sub) {
        case "msg":
        case "message":
        case "text":
          return handleBulkMessage(ctx, rest);

        case "image":
        case "img":
        case "photo":
          return handleBulkImage(ctx, rest);

        case "doc":
        case "document":
        case "file":
          return handleBulkDocument(ctx, rest);

        default:
          return reply(
            `📤 *BULK SENDER*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `*Usage:*\n` +
              `▸ *.bulk msg <numbers> | <message>*\n` +
              `▸ *.bulk image <numbers> | <caption>* _(reply to an image)_\n` +
              `▸ *.bulk doc <numbers> | <caption>* _(reply to a document)_\n\n` +
              `*Numbers:* comma or newline separated, e.g.\n` +
              `_923001234567,923009876543_\n\n` +
              `⚠️ *Limits:* max ${MAX_RECIPIENTS} recipients per command, ~${MIN_DELAY_MS / 1000}-${MAX_DELAY_MS / 1000}s delay between sends to avoid spam flags.\n\n` +
              `> 🤖 *Powered by AA MD Bot*`,
          );
      }
    } catch (err) {
      return reply(
        `❌ *Unexpected Error*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${String(err?.message || err)}`,
      );
    }
  },
};
