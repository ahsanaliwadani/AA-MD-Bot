// ============================================
// AA MD Bot - Newsletter / Channel Manager
// Complete WhatsApp Channels (Newsletter) manager
// Data persisted per connected number via sessionSettings
// ============================================
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ───────────────────────────── CONSTANTS ────────────────────────────── */

const NEWSLETTER_LINK_REGEX =
  /(?:https?:\/\/)?whatsapp\.com\/channel\/([A-Za-z0-9]+)/i;
const NEWSLETTER_JID_REGEX = /^\d+@newsletter$/i;
const RAW_INVITE_CODE_REGEX = /^[A-Za-z0-9]{10,}$/;

const EMOJI = {
  ok: "✅",
  err: "❌",
  warn: "⚠️",
  loading: "⏳",
  info: "ℹ️",
  channel: "📰",
  star: "⭐",
  fire: "🔥",
  bell: "🔔",
  mute: "🔇",
  people: "👥",
  heart: "❤️",
  link: "🔗",
  calendar: "📅",
  trophy: "🏆",
  stats: "📊",
  export: "📤",
  import: "📥",
  search: "🔍",
  picture: "🖼️",
  owner: "👑",
};

const LINE = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const FOOTER = "\n\n> 🤖 *Powered by AA MD Bot*";

/* ───────────────────────── SESSION SETTINGS (DB) ────────────────────── */
// sessionSettings is provided per-connected-number by the bot framework and
// already survives restarts, so this plugin just reads/writes one namespaced
// key on it: 'newsletterData'.

const DEFAULT_DATA = () => ({
  muted: {}, // { [jid]: true }
  cache: {}, // { [jid]: { metadata, fetchedAt } }
  known: {}, // { [jid]: { addedAt, source } }  local registry (Baileys has no "list all" API)
  stats: { totalCommands: 0 },
  exports: [],
});

function loadData(sessionSettings) {
  const existing = sessionSettings.get("newsletterData");
  return existing && typeof existing === "object"
    ? { ...DEFAULT_DATA(), ...existing }
    : DEFAULT_DATA();
}

function saveData(sessionSettings, data) {
  sessionSettings.set("newsletterData", data);
}

/* ─────────────────────────────── HELPERS ─────────────────────────────── */

function validateLink(input) {
  if (!input || typeof input !== "string") return null;
  const text = input.trim();
  if (NEWSLETTER_JID_REGEX.test(text)) return { type: "jid", key: text };
  const linkMatch = text.match(NEWSLETTER_LINK_REGEX);
  if (linkMatch && linkMatch[1]) return { type: "invite", key: linkMatch[1] };
  if (RAW_INVITE_CODE_REGEX.test(text) && !text.includes(" "))
    return { type: "invite", key: text };
  return null;
}

function extractInviteCode(input) {
  const v = validateLink(input);
  return v && v.type === "invite" ? v.key : null;
}

function extractNewsletterID(input) {
  const v = validateLink(input);
  return v && v.type === "jid" ? v.key : null;
}

function formatFollowers(count) {
  const n = Number(count) || 0;
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function formatDate(ts) {
  if (!ts) return "Unknown";
  const ms = String(ts).length > 10 ? Number(ts) : Number(ts) * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isVerified(metadata) {
  const v = metadata?.verification ?? metadata?.thread_metadata?.verification;
  return v === "VERIFIED" || v === true;
}

function getName(metadata) {
  const n = metadata?.name ?? metadata?.thread_metadata?.name?.text;
  return typeof n === "string" ? n : n?.text || "Unnamed Channel";
}

function getDescription(metadata) {
  const d =
    metadata?.description ?? metadata?.thread_metadata?.description?.text;
  return typeof d === "string" && d.length ? d : d?.text || "No description";
}

function getFollowerCount(metadata) {
  return (
    metadata?.subscribers ?? metadata?.thread_metadata?.subscribers_count ?? 0
  );
}

function getReactionCount(metadata) {
  return (
    metadata?.reaction_codes?.length ??
    metadata?.thread_metadata?.settings?.reaction_codes?.length ??
    metadata?.viewer_metadata?.reaction_count ??
    0
  );
}

function getCreationTime(metadata) {
  return metadata?.creation_time ?? metadata?.thread_metadata?.creation_time;
}

function getOwner(metadata) {
  return metadata?.owner ?? metadata?.thread_metadata?.owner ?? "Unknown";
}

function getInvite(metadata) {
  return metadata?.invite ?? metadata?.thread_metadata?.invite ?? null;
}

function getPictureUrl(metadata) {
  return (
    metadata?.picture ||
    metadata?.thread_metadata?.picture?.url ||
    metadata?.preview ||
    null
  );
}

function getMuteStatus(metadata, jid, sessionSettings) {
  const remote = metadata?.mute ?? metadata?.viewer_metadata?.mute;
  if (remote !== undefined) return remote === "ON" || remote === true;
  const data = loadData(sessionSettings);
  return !!data.muted[jid];
}

// Resolves the owner flag regardless of what the framework calls it.
function resolveOwnerFlag(ctx) {
  return !!(ctx.isOwner ?? ctx.owner ?? ctx.fromMe ?? false);
}

function friendlyError(err) {
  const msg = (err?.message || String(err) || "").toLowerCase();
  if (
    msg.includes("not_found") ||
    msg.includes("404") ||
    msg.includes("item-not-found")
  )
    return {
      title: "Channel Not Found",
      detail:
        "This channel does not exist, was deleted, or the link/ID is invalid.",
    };
  if (
    msg.includes("forbidden") ||
    msg.includes("403") ||
    msg.includes("not-authorized")
  )
    return {
      title: "Permission Denied",
      detail: "You are not allowed to perform this action on this channel.",
    };
  if (msg.includes("already") && msg.includes("follow"))
    return {
      title: "Already Following",
      detail: "You are already following this channel.",
    };
  if (msg.includes("not") && msg.includes("follow"))
    return {
      title: "Not Following",
      detail: "You are not following this channel yet.",
    };
  if (msg.includes("expired") || msg.includes("invite"))
    return {
      title: "Invite Expired or Invalid",
      detail: "This invite link/code is no longer valid.",
    };
  if (msg.includes("rate") || msg.includes("429") || msg.includes("too many"))
    return {
      title: "Rate Limited",
      detail:
        "Too many requests were sent recently. Please wait a moment and try again.",
    };
  if (msg.includes("timeout") || msg.includes("timed out"))
    return {
      title: "Request Timed Out",
      detail: "WhatsApp servers took too long to respond. Please try again.",
    };
  if (
    msg.includes("network") ||
    msg.includes("econn") ||
    msg.includes("enotfound")
  )
    return {
      title: "Network Error",
      detail:
        "Could not reach WhatsApp servers. Check your connection and try again.",
    };
  if (msg.includes("private"))
    return {
      title: "Private Channel",
      detail: "This channel is private and cannot be accessed.",
    };
  return {
    title: "Unexpected Error",
    detail: err?.message || "An unknown error occurred.",
  };
}

async function downloadPicture(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Picture download failed (HTTP ${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchLatest(sock, jid) {
  const messages = await sock.newsletterFetchMessages("jid", jid, 1);
  if (!Array.isArray(messages) || messages.length === 0) return null;
  return messages[0];
}

/**
 * resolveMetadata
 * Fetches newsletter metadata via Baileys, using the per-number cache when fresh.
 */
async function resolveMetadata(
  sock,
  sessionSettings,
  ref,
  { forceFresh = false } = {},
) {
  const cacheKey = ref.type === "jid" ? ref.key : `invite:${ref.key}`;
  const data = loadData(sessionSettings);

  if (
    !forceFresh &&
    data.cache[cacheKey] &&
    Date.now() - data.cache[cacheKey].fetchedAt < 60_000
  ) {
    return data.cache[cacheKey].metadata;
  }

  const metadata = await sock.newsletterMetadata(ref.type, ref.key);
  if (!metadata) throw new Error("NOT_FOUND");

  const id = metadata.id || (ref.type === "jid" ? ref.key : cacheKey);
  data.cache[id] = { metadata, fetchedAt: Date.now() };
  if (ref.type === "invite" && metadata.id)
    data.cache[cacheKey] = { metadata, fetchedAt: Date.now() };
  saveData(sessionSettings, data);

  return metadata;
}

function registerKnown(sessionSettings, jid, source = "follow") {
  const data = loadData(sessionSettings);
  if (!data.known[jid]) {
    data.known[jid] = { addedAt: Date.now(), source };
    saveData(sessionSettings, data);
  }
}

function forgetKnown(sessionSettings, jid) {
  const data = loadData(sessionSettings);
  delete data.known[jid];
  delete data.cache[jid];
  delete data.muted[jid];
  saveData(sessionSettings, data);
}

function setMuted(sessionSettings, jid, muted) {
  const data = loadData(sessionSettings);
  if (muted) data.muted[jid] = true;
  else delete data.muted[jid];
  saveData(sessionSettings, data);
}

function isMuted(sessionSettings, jid) {
  return !!loadData(sessionSettings).muted[jid];
}

/* ───────────────────────────── HELP MENU ─────────────────────────────── */

function buildHelpMenu() {
  return `${EMOJI.channel} *NEWSLETTER / CHANNEL MANAGER* ${EMOJI.channel}
${LINE}
_Complete WhatsApp Channels manager_

*${EMOJI.info} General*
.newsletter <link>  _(shortcut: auto-fetch + follow)_
.newsletter get <link>
.newsletter info <link|id>
.newsletter latest <link|id>
.newsletter search <keyword>
.newsletter picture <link|id>
.newsletter invite <newsletter id>

*${EMOJI.bell} Actions*
.newsletter follow <link|id>
.newsletter unfollow <link|id>
.newsletter mute <link|id>
.newsletter unmute <link|id>
.newsletter react <link|id> <emoji>

*${EMOJI.people} Lists*
.newsletter list
.newsletter owner
.newsletter stats

*${EMOJI.owner} Owner Only*
.newsletter export
.newsletter import <json>

${LINE}
*Aliases:* channel, channels, nl, news, wachannel
_Links accepted: whatsapp.com/channel/... , raw invite code, or newsletter id_${FOOTER}`;
}

/* ──────────────────────────── SUBCOMMANDS ─────────────────────────────── */

async function handleInfo({ sock, jid, msg, reply, sessionSettings }, arg) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Fetching channel information...*`);

  let metadata;
  try {
    metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }

  const id = metadata.id || (ref.type === "jid" ? ref.key : null);

  const text = `${EMOJI.channel} *${getName(metadata)}*
${LINE}
${EMOJI.info} *ID:* ${id || "Unknown"}
${EMOJI.link} *Invite Code:* ${getInvite(metadata) || "N/A"}
${isVerified(metadata) ? `${EMOJI.star} *Verified:* Yes` : `${EMOJI.info} *Verified:* No`}
${EMOJI.calendar} *Created:* ${formatDate(getCreationTime(metadata))}
${EMOJI.people} *Followers:* ${formatFollowers(getFollowerCount(metadata))}
${EMOJI.heart} *Reactions:* ${getReactionCount(metadata)}
${EMOJI.owner} *Owner:* ${getOwner(metadata)}
${id && getMuteStatus(metadata, id, sessionSettings) ? `${EMOJI.mute} *Muted:* Yes` : `${EMOJI.bell} *Muted:* No`}
${LINE}
*Description:*
${getDescription(metadata)}${FOOTER}`;

  const pic = getPictureUrl(metadata);
  if (pic) {
    try {
      return sock.sendMessage(
        jid,
        { image: { url: pic }, caption: text },
        { quoted: msg },
      );
    } catch {
      /* fall through to text-only */
    }
  }
  return reply(text);
}

async function handleGet({ sock, jid, msg, reply, sessionSettings }, arg) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Fetching channel and following if needed...*`);

  let metadata;
  try {
    metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }

  const nJid = metadata.id || (ref.type === "jid" ? ref.key : null);
  if (!nJid)
    return reply(
      `${EMOJI.err} *Channel Not Found*\n${LINE}\nCould not resolve this link to a channel.${FOOTER}`,
    );

  const alreadyKnown = !!loadData(sessionSettings).known[nJid];
  let followNote = `${EMOJI.info} Already followed.`;

  if (!alreadyKnown) {
    try {
      await sock.newsletterFollow(nJid);
      registerKnown(sessionSettings, nJid, "follow");
      followNote = `${EMOJI.ok} Followed just now.`;
    } catch (e) {
      // Not fatal for "get" — some newsletters can still be viewed/info'd
      // without following. Report the follow failure but keep showing info.
      const f = friendlyError(e);
      followNote = `${EMOJI.warn} Follow failed (${f.title}) — showing info anyway.`;
    }
  }

  const id = nJid;
  const text = `${EMOJI.channel} *${getName(metadata)}*
${LINE}
${followNote}
${LINE}
${EMOJI.info} *ID:* ${id}
${EMOJI.link} *Invite Code:* ${getInvite(metadata) || "N/A"}
${isVerified(metadata) ? `${EMOJI.star} *Verified:* Yes` : `${EMOJI.info} *Verified:* No`}
${EMOJI.calendar} *Created:* ${formatDate(getCreationTime(metadata))}
${EMOJI.people} *Followers:* ${formatFollowers(getFollowerCount(metadata))}
${EMOJI.heart} *Reactions:* ${getReactionCount(metadata)}
${EMOJI.owner} *Owner:* ${getOwner(metadata)}
${LINE}
*Description:*
${getDescription(metadata)}${FOOTER}`;

  const pic = getPictureUrl(metadata);
  if (pic) {
    try {
      return sock.sendMessage(
        jid,
        { image: { url: pic }, caption: text },
        { quoted: msg },
      );
    } catch {
      /* fall through to text-only */
    }
  }
  return reply(text);
}

async function handleFollow({ sock, jid, msg, reply, sessionSettings }, arg) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Following channel...*`);

  try {
    const metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
    const nJid = metadata.id || (ref.type === "jid" ? ref.key : null);
    if (!nJid) throw new Error("NOT_FOUND");

    await sock.newsletterFollow(nJid);
    registerKnown(sessionSettings, nJid, "follow");

    return reply(
      `${EMOJI.ok} *Followed Successfully*\n${LINE}\n${EMOJI.channel} *${getName(metadata)}*\n${EMOJI.people} ${formatFollowers(getFollowerCount(metadata))} followers${FOOTER}`,
    );
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }
}

async function handleUnfollow({ sock, reply, sessionSettings }, arg) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Leaving channel...*`);

  try {
    const metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
    const nJid = metadata.id || (ref.type === "jid" ? ref.key : null);
    if (!nJid) throw new Error("NOT_FOUND");

    await sock.newsletterUnfollow(nJid);
    forgetKnown(sessionSettings, nJid);

    return reply(
      `${EMOJI.ok} *Unfollowed Successfully*\n${LINE}\n${EMOJI.channel} *${getName(metadata)}*${FOOTER}`,
    );
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }
}

async function handleList({ sock, reply, sessionSettings }) {
  const known = Object.keys(loadData(sessionSettings).known);
  if (known.length === 0)
    return reply(
      `${EMOJI.err} *No Channels Found*\n${LINE}\nYou have not followed any channels through this bot yet.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Loading your channels...*`);

  let out = `${EMOJI.channel} *FOLLOWED CHANNELS* (${known.length})\n${LINE}\n`;
  let idx = 1;
  for (const nJid of known) {
    try {
      const metadata = await resolveMetadata(sock, sessionSettings, {
        type: "jid",
        key: nJid,
      });
      out += `*${idx}. ${getName(metadata)}*\n${EMOJI.people} ${formatFollowers(getFollowerCount(metadata))}  ${isVerified(metadata) ? `${EMOJI.star} Verified` : ""}\n${EMOJI.info} ID: ${nJid}\n${EMOJI.link} ${getInvite(metadata) ? `https://whatsapp.com/channel/${getInvite(metadata)}` : "N/A"}\n${LINE}\n`;
    } catch {
      out += `*${idx}. (unavailable)*\n${EMOJI.info} ID: ${nJid}\n${LINE}\n`;
    }
    idx++;
  }
  return reply(out.trim() + FOOTER);
}

async function handleOwner({ sock, reply, sessionSettings }, isOwnerFlag) {
  if (!isOwnerFlag)
    return reply(
      `${EMOJI.err} *Owner Only*\n${LINE}\nThis command can only be used by the bot owner.${FOOTER}`,
    );

  const data = loadData(sessionSettings);
  const entries = Object.entries(data.known).filter(
    ([, v]) => v.source === "create",
  );
  if (entries.length === 0)
    return reply(
      `${EMOJI.err} *No Owned Channels*\n${LINE}\nNo channels created through this bot were found.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Loading owned channels...*`);

  let out = `${EMOJI.owner} *OWNED CHANNELS* (${entries.length})\n${LINE}\n`;
  let idx = 1;
  for (const [nJid] of entries) {
    try {
      const metadata = await resolveMetadata(sock, sessionSettings, {
        type: "jid",
        key: nJid,
      });
      out += `*${idx}. ${getName(metadata)}*\n${EMOJI.people} ${formatFollowers(getFollowerCount(metadata))}\n${EMOJI.info} ID: ${nJid}\n${LINE}\n`;
    } catch {
      out += `*${idx}. (unavailable)*\n${EMOJI.info} ID: ${nJid}\n${LINE}\n`;
    }
    idx++;
  }
  return reply(out.trim() + FOOTER);
}

async function handleMute({ sock, reply, sessionSettings }, arg, mute) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );

  await reply(
    mute
      ? `${EMOJI.loading} *Muting channel...*`
      : `${EMOJI.loading} *Unmuting channel...*`,
  );

  try {
    const metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
    const nJid = metadata.id || (ref.type === "jid" ? ref.key : null);
    if (!nJid) throw new Error("NOT_FOUND");

    if (mute) {
      if (isMuted(sessionSettings, nJid))
        return reply(
          `${EMOJI.warn} *Already Muted*\n${LINE}\n${getName(metadata)} is already muted.${FOOTER}`,
        );
      await sock.newsletterMute(nJid);
      setMuted(sessionSettings, nJid, true);
      return reply(
        `${EMOJI.ok} *Channel Muted*\n${LINE}\n${EMOJI.mute} *${getName(metadata)}*${FOOTER}`,
      );
    } else {
      if (!isMuted(sessionSettings, nJid))
        return reply(
          `${EMOJI.warn} *Not Muted*\n${LINE}\n${getName(metadata)} is not currently muted.${FOOTER}`,
        );
      await sock.newsletterUnmute(nJid);
      setMuted(sessionSettings, nJid, false);
      return reply(
        `${EMOJI.ok} *Channel Unmuted*\n${LINE}\n${EMOJI.bell} *${getName(metadata)}*${FOOTER}`,
      );
    }
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }
}

async function handleReact({ sock, reply, sessionSettings }, arg, emoji) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );
  if (!emoji)
    return reply(
      `${EMOJI.err} *Missing Emoji*\n${LINE}\nUsage: .newsletter react <link> ${EMOJI.heart}${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Reacting to latest post...*`);

  try {
    const metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
    const nJid = metadata.id || (ref.type === "jid" ? ref.key : null);
    if (!nJid) throw new Error("NOT_FOUND");

    const latest = await fetchLatest(sock, nJid);
    if (!latest)
      return reply(
        `${EMOJI.err} *No Posts Found*\n${LINE}\nThis channel has no recent posts to react to.${FOOTER}`,
      );

    const serverId = latest.newsletterServerId || latest.serverId || latest.id;
    await sock.newsletterReactMessage(nJid, String(serverId), emoji);

    return reply(
      `${EMOJI.ok} *Reaction Sent*\n${LINE}\n${emoji} reacted on latest post in *${getName(metadata)}*${FOOTER}`,
    );
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }
}

async function handleLatest({ sock, reply, sessionSettings }, arg) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Fetching latest post...*`);

  try {
    const metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
    const nJid = metadata.id || (ref.type === "jid" ? ref.key : null);
    if (!nJid) throw new Error("NOT_FOUND");

    const latest = await fetchLatest(sock, nJid);
    if (!latest)
      return reply(
        `${EMOJI.err} *No Posts Found*\n${LINE}\nThis channel has not posted anything yet.${FOOTER}`,
      );

    const caption =
      latest.message?.extendedTextMessage?.text ||
      latest.message?.conversation ||
      latest.message?.imageMessage?.caption ||
      latest.message?.videoMessage?.caption ||
      "(no caption)";

    const mediaType = latest.message
      ? Object.keys(latest.message)[0]?.replace("Message", "") || "text"
      : "text";

    const text = `${EMOJI.channel} *Latest Post — ${getName(metadata)}*
${LINE}
*Caption:* ${caption}
*Media Type:* ${mediaType}
*Timestamp:* ${formatDate(latest.messageTimestamp)}
*Views:* ${latest.viewsCount ?? latest.views ?? "N/A"}
*Reactions:* ${latest.reactionCounts ? Object.values(latest.reactionCounts).reduce((a, b) => a + b, 0) : "N/A"}
*Message ID:* ${latest.newsletterServerId || latest.serverId || latest.id || "N/A"}${FOOTER}`;

    return reply(text);
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }
}

async function handleSearch({ sock, reply, sessionSettings }, keyword) {
  if (!keyword)
    return reply(
      `${EMOJI.err} *Missing Keyword*\n${LINE}\nUsage: .newsletter search <keyword>${FOOTER}`,
    );

  const known = Object.keys(loadData(sessionSettings).known);
  if (known.length === 0)
    return reply(
      `${EMOJI.err} *No Channels Followed*\n${LINE}\nFollow some channels first before searching.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Searching for "${keyword}"...*`);

  const lower = keyword.toLowerCase();
  const matches = [];
  for (const nJid of known) {
    try {
      const metadata = await resolveMetadata(sock, sessionSettings, {
        type: "jid",
        key: nJid,
      });
      if (
        getName(metadata).toLowerCase().includes(lower) ||
        getDescription(metadata).toLowerCase().includes(lower)
      ) {
        matches.push({ nJid, metadata });
      }
    } catch {
      /* skip unavailable */
    }
  }

  if (matches.length === 0)
    return reply(
      `${EMOJI.err} *No Matches*\n${LINE}\nNo followed channels matched "${keyword}".${FOOTER}`,
    );

  let out = `${EMOJI.search} *SEARCH RESULTS* (${matches.length})\n${LINE}\n`;
  matches.forEach((m, i) => {
    out += `*${i + 1}. ${getName(m.metadata)}*\n${EMOJI.people} ${formatFollowers(getFollowerCount(m.metadata))}\n${EMOJI.info} ID: ${m.nJid}\n${LINE}\n`;
  });
  return reply(out.trim() + FOOTER);
}

async function handleInvite({ sock, reply, sessionSettings }, arg) {
  const id =
    extractNewsletterID(arg) ||
    (NEWSLETTER_JID_REGEX.test(arg || "") ? arg.trim() : null);
  if (!id)
    return reply(
      `${EMOJI.err} *Invalid ID*\n${LINE}\nProvide a valid newsletter ID (format: 1234567890@newsletter).${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Generating invite link...*`);

  try {
    const metadata = await resolveMetadata(
      sock,
      sessionSettings,
      { type: "jid", key: id },
      { forceFresh: true },
    );
    const invite = getInvite(metadata);
    if (!invite)
      return reply(
        `${EMOJI.err} *Invite Unavailable*\n${LINE}\nCould not generate an invite link for this channel.${FOOTER}`,
      );

    return reply(
      `${EMOJI.ok} *Invite Link Generated*\n${LINE}\n${EMOJI.channel} *${getName(metadata)}*\n${EMOJI.link} https://whatsapp.com/channel/${invite}${FOOTER}`,
    );
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }
}

async function handlePicture({ sock, jid, msg, reply, sessionSettings }, arg) {
  const ref = validateLink(arg);
  if (!ref)
    return reply(
      `${EMOJI.err} *Invalid Link*\n${LINE}\nProvide a valid channel link, invite code, or newsletter ID.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Downloading profile picture...*`);

  try {
    const metadata = await resolveMetadata(sock, sessionSettings, ref, {
      forceFresh: true,
    });
    const url = getPictureUrl(metadata);
    if (!url)
      return reply(
        `${EMOJI.err} *No Picture*\n${LINE}\n*${getName(metadata)}* does not have a profile picture set.${FOOTER}`,
      );

    const buffer = await downloadPicture(url);
    if (!buffer)
      return reply(
        `${EMOJI.err} *Download Failed*\n${LINE}\nCould not download the profile picture.${FOOTER}`,
      );

    return sock.sendMessage(
      jid,
      {
        image: buffer,
        caption: `${EMOJI.picture} Profile picture — *${getName(metadata)}*${FOOTER}`,
      },
      { quoted: msg },
    );
  } catch (e) {
    const f = friendlyError(e);
    return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
  }
}

async function handleStats({ sock, reply, sessionSettings }) {
  const data = loadData(sessionSettings);
  const known = Object.keys(data.known);
  const muted = Object.keys(data.muted);

  if (known.length === 0)
    return reply(
      `${EMOJI.err} *No Data Yet*\n${LINE}\nFollow some channels first to build up statistics.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Calculating statistics...*`);

  let totalFollowers = 0,
    verifiedCount = 0,
    ownedCount = 0;
  let largest = null,
    newest = null,
    oldest = null;

  for (const nJid of known) {
    try {
      const metadata = await resolveMetadata(sock, sessionSettings, {
        type: "jid",
        key: nJid,
      });
      const followers = Number(getFollowerCount(metadata)) || 0;
      totalFollowers += followers;
      if (isVerified(metadata)) verifiedCount++;
      if (data.known[nJid]?.source === "create") ownedCount++;
      if (!largest || followers > largest.followers)
        largest = { name: getName(metadata), followers };
      const created = getCreationTime(metadata);
      if (created) {
        if (!newest || created > newest.time)
          newest = { name: getName(metadata), time: created };
        if (!oldest || created < oldest.time)
          oldest = { name: getName(metadata), time: created };
      }
    } catch {
      /* skip unavailable */
    }
  }

  const text = `${EMOJI.stats} *NEWSLETTER STATISTICS*
${LINE}
${EMOJI.channel} *Total Followed:* ${known.length}
${EMOJI.owner} *Total Owned:* ${ownedCount}
${EMOJI.star} *Verified Channels:* ${verifiedCount}
${EMOJI.mute} *Muted Channels:* ${muted.length}
${EMOJI.people} *Followers (combined):* ${formatFollowers(totalFollowers)}
${LINE}
${EMOJI.trophy} *Largest:* ${largest ? `${largest.name} (${formatFollowers(largest.followers)})` : "N/A"}
${EMOJI.fire} *Newest:* ${newest ? `${newest.name} (${formatDate(newest.time)})` : "N/A"}
${EMOJI.calendar} *Oldest:* ${oldest ? `${oldest.name} (${formatDate(oldest.time)})` : "N/A"}${FOOTER}`;

  return reply(text);
}

async function handleExport(
  { sock, jid, msg, reply, sessionSettings },
  isOwnerFlag,
) {
  if (!isOwnerFlag)
    return reply(
      `${EMOJI.err} *Owner Only*\n${LINE}\nThis command can only be used by the bot owner.${FOOTER}`,
    );

  const data = loadData(sessionSettings);
  const ids = Object.keys(data.known);
  if (ids.length === 0)
    return reply(
      `${EMOJI.err} *Nothing to Export*\n${LINE}\nNo channels are being tracked yet.${FOOTER}`,
    );

  await reply(`${EMOJI.loading} *Building export file...*`);

  const payload = {
    exportedAt: new Date().toISOString(),
    count: ids.length,
    channels: [],
  };
  for (const nJid of ids) {
    try {
      const metadata = await resolveMetadata(sock, sessionSettings, {
        type: "jid",
        key: nJid,
      });
      payload.channels.push({
        id: nJid,
        name: getName(metadata),
        invite: getInvite(metadata),
        followers: getFollowerCount(metadata),
        verified: isVerified(metadata),
        muted: isMuted(sessionSettings, nJid),
        source: data.known[nJid]?.source || "unknown",
      });
    } catch {
      payload.channels.push({ id: nJid, error: "unavailable" });
    }
  }

  data.exports.push({ at: Date.now(), count: payload.channels.length });
  data.exports = data.exports.slice(-20);
  saveData(sessionSettings, data);

  const buffer = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
  return sock.sendMessage(
    jid,
    {
      document: buffer,
      fileName: `newsletter-export-${Date.now()}.json`,
      mimetype: "application/json",
      caption: `${EMOJI.export} Exported ${payload.channels.length} channel(s).${FOOTER}`,
    },
    { quoted: msg },
  );
}

async function handleImport({ reply, sessionSettings }, jsonText, isOwnerFlag) {
  if (!isOwnerFlag)
    return reply(
      `${EMOJI.err} *Owner Only*\n${LINE}\nThis command can only be used by the bot owner.${FOOTER}`,
    );
  if (!jsonText)
    return reply(
      `${EMOJI.err} *Missing Data*\n${LINE}\nReply to or paste a previously exported JSON payload.\nUsage: .newsletter import <json>${FOOTER}`,
    );

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return reply(
      `${EMOJI.err} *Invalid JSON*\n${LINE}\nThe provided text is not valid JSON.${FOOTER}`,
    );
  }

  if (!parsed || !Array.isArray(parsed.channels)) {
    return reply(
      `${EMOJI.err} *Invalid Format*\n${LINE}\nExpected an object with a "channels" array (as produced by .newsletter export).${FOOTER}`,
    );
  }

  await reply(`${EMOJI.loading} *Importing channels...*`);

  const data = loadData(sessionSettings);
  let imported = 0,
    skipped = 0;
  for (const ch of parsed.channels) {
    if (!ch || !ch.id || !NEWSLETTER_JID_REGEX.test(ch.id)) {
      skipped++;
      continue;
    }
    if (!data.known[ch.id])
      data.known[ch.id] = { addedAt: Date.now(), source: "import" };
    if (ch.muted) data.muted[ch.id] = true;
    imported++;
  }
  saveData(sessionSettings, data);

  return reply(
    `${EMOJI.ok} *Import Complete*\n${LINE}\n${EMOJI.import} Imported: ${imported}\n${EMOJI.warn} Skipped: ${skipped}${FOOTER}`,
  );
}

/* ─────────────────────────────── PLUGIN ─────────────────────────────── */

export default {
  command: "newsletter",
  alias: ["channel", "channels", "nl", "news", "wachannel"],
  description: "Complete WhatsApp Channels (Newsletter) Manager.",
  category: "whatsapp",
  usage:
    ".newsletter <info|follow|unfollow|list|owner|mute|unmute|react|latest|search|invite|picture|stats|export|import> [args]",
  ownerOnly: false,
  async execute(ctx) {
    const { reply, args, sessionSettings } = ctx;

    try {
      const data = loadData(sessionSettings);
      data.stats.totalCommands = (data.stats.totalCommands || 0) + 1;
      saveData(sessionSettings, data);

      const sub = (args[0] || "").toLowerCase();
      const rest = args.slice(1).join(" ").trim();
      const isOwnerFlag = resolveOwnerFlag(ctx);

      if (!sub) return reply(buildHelpMenu());

      switch (sub) {
        case "info":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter info <channel link>${FOOTER}`,
            );
          return handleInfo(ctx, rest);

        // .newsletter get <link>  — one-shot: follow the channel (if not already
        // followed) AND immediately show its info. Handy when you just have a
        // link and want everything ("laana") in a single command.
        case "get":
        case "fetch":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter get <channel link>${FOOTER}`,
            );
          return handleGet(ctx, rest);

        case "follow":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter follow <channel link>${FOOTER}`,
            );
          return handleFollow(ctx, rest);

        case "unfollow":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter unfollow <channel link>${FOOTER}`,
            );
          return handleUnfollow(ctx, rest);

        case "list":
          return handleList(ctx);

        case "owner":
          return handleOwner(ctx, isOwnerFlag);

        case "mute":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter mute <channel link>${FOOTER}`,
            );
          return handleMute(ctx, rest, true);

        case "unmute":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter unmute <channel link>${FOOTER}`,
            );
          return handleMute(ctx, rest, false);

        case "react": {
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Arguments*\n${LINE}\nUsage: .newsletter react <link> <emoji>${FOOTER}`,
            );
          const parts = rest.split(" ");
          const emoji = parts.pop();
          const link = parts.join(" ");
          return handleReact(ctx, link, emoji);
        }

        case "latest":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter latest <channel link>${FOOTER}`,
            );
          return handleLatest(ctx, rest);

        case "search":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Keyword*\n${LINE}\nUsage: .newsletter search <keyword>${FOOTER}`,
            );
          return handleSearch(ctx, rest);

        case "invite":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing ID*\n${LINE}\nUsage: .newsletter invite <newsletter id>${FOOTER}`,
            );
          return handleInvite(ctx, rest);

        case "picture":
          if (!rest)
            return reply(
              `${EMOJI.err} *Missing Link*\n${LINE}\nUsage: .newsletter picture <channel link>${FOOTER}`,
            );
          return handlePicture(ctx, rest);

        case "stats":
          return handleStats(ctx);

        case "export":
          return handleExport(ctx, isOwnerFlag);

        case "import": {
          const quoted =
            ctx.msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const quotedText =
            quoted?.conversation || quoted?.extendedTextMessage?.text || "";
          const jsonText = rest || quotedText;
          return handleImport(ctx, jsonText, isOwnerFlag);
        }

        default: {
          // No recognized subcommand — but if what was typed is itself a valid
          // channel link / invite code / newsletter id, treat the whole thing
          // as a shortcut for "get" (auto-follow + show info), e.g.:
          //   .newsletter https://whatsapp.com/channel/xxxxxxxx
          const wholeInput = args.join(" ").trim();
          const asLink = validateLink(wholeInput);
          if (asLink) return handleGet(ctx, wholeInput);

          return reply(buildHelpMenu());
        }
      }
    } catch (err) {
      const f = friendlyError(err);
      return reply(`${EMOJI.err} *${f.title}*\n${LINE}\n${f.detail}${FOOTER}`);
    }
  },
};
