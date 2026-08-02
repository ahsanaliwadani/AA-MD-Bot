// ============================================
// AA MD Bot — Pakistan SIM Owner Lookup 🇵🇰
// Developer: Ahsan Ali | AA Mods
//
// Source: Truecaller via RapidAPI (truecaller4.p.rapidapi.com)
// No token setup needed — RapidAPI key se directly kaam karta hai
// Commands: .simowner .callerid .truecaller .simname .siminfo
// ============================================

import axios from 'axios';
import config from '../../config.js';

const FOOTER = '\n\n> 🇵🇰 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// ── Per-user daily rate limit (2 requests/day for regular users) ──────────────
const DAILY_LIMIT = 2;
const _rateLimitMap = new Map(); // key: senderJid → { date: 'YYYY-MM-DD', count: N }

function getToday() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/** Returns true if allowed, false if limit hit */
function checkRateLimit(senderJid, isOwner) {
  // Owner and SuperOwner → always allowed
  if (isOwner) return { allowed: true };
  const superOwnerNum = String(config.superOwner || '');
  const senderNum = (senderJid || '').split('@')[0].split(':')[0];
  if (superOwnerNum && senderNum === superOwnerNum) return { allowed: true };

  const today = getToday();
  const entry = _rateLimitMap.get(senderJid);

  if (!entry || entry.date !== today) {
    // Fresh day — reset
    _rateLimitMap.set(senderJid, { date: today, count: 1 });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }

  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

// RapidAPI key — env secret ya hardcoded fallback
function getApiKey() {
  return process.env.RAPIDAPI_TRUECALLER_KEY
    || process.env.RAPIDAPI_KEY
    || '8eb4831202mshebcbbd8b96ccd71p129820jsn9b7b3f11c188';
}

// ── Pakistan prefix → operator map (PTA official series) ────────────────────
const OPERATORS = {
  '030': 'Jazz (Mobilink)', '031': 'Zong (China Mobile)',
  '032': 'Jazz (Warid)',    '033': 'Ufone (PTCL)',
  '034': 'Telenor',        '045': 'SCO (SCOM)',
};
const OP_COLORS = {
  'Jazz (Mobilink)': '🟠', 'Jazz (Warid)': '🟠',
  'Zong (China Mobile)': '🔵', 'Ufone (PTCL)': '🟢',
  'Telenor': '🔴', 'SCO (SCOM)': '🟣',
};

// ── Normalise number ─────────────────────────────────────────────────────────
function normalise(raw) {
  let n = raw.replace(/[\s\-.()+]/g, '');
  if (n.startsWith('0092')) n = '92' + n.slice(4);
  else if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
  else if (n.startsWith('+')) n = n.slice(1);
  // should be 12 digits: 923XXXXXXXXX
  return n;
}

function toDisplay(norm) {
  // 923346741532 → 0334-6741532
  if (norm.startsWith('92') && norm.length === 12) {
    const local = '0' + norm.slice(2); // 03346741532
    return local.slice(0, 4) + '-' + local.slice(4);
  }
  return norm;
}

function getOperator(norm) {
  if (!norm.startsWith('92')) return null;
  const local = '0' + norm.slice(2); // 03346741532
  const prefix3 = local.slice(0, 3); // 033
  return OPERATORS[prefix3] || null;
}

// ── Spam bar ─────────────────────────────────────────────────────────────────
function spamBar(score) {
  // score is negative in API (e.g. -59 = heavy spam)
  const abs = Math.abs(score || 0);
  const level = Math.min(5, Math.ceil(abs / 20));
  return '🔴'.repeat(level) + '⚪'.repeat(5 - level);
}

// ── Main API call ────────────────────────────────────────────────────────────
async function tcLookup(phone, countryCode = 'PK') {
  const key = getApiKey();
  const { data } = await axios.get('https://truecaller4.p.rapidapi.com/api/v1/getDetails', {
    params: { phone, countryCode },
    headers: {
      'x-rapidapi-host': 'truecaller4.p.rapidapi.com',
      'x-rapidapi-key':  key,
      'Content-Type':    'application/json',
    },
    timeout: 12000,
  });
  return data;
}

export default {
  command:     'simowner',
  alias:       ['callerid', 'truecaller', 'simname', 'siminfo', 'tcall', 'ownersim', 'pkowner'],
  description: 'Pakistan SIM owner info via Truecaller 🇵🇰',
  category:    'search',
  usage:       '.simowner <number>',

  async execute({ text, reply, react, prefix, sock, jid, msg, senderJid, isOwner }) {
    const input = (text || '').trim();

    // ── Rate limit check ─────────────────────────────────────────────────────
    const rl = checkRateLimit(senderJid, isOwner);
    if (!rl.allowed) {
      return reply(
        `⏳ *Daily Limit Reached*\n\n` +
        `📵 Aap ne aaj *${DAILY_LIMIT}* simowner lookups use kar liye hain.\n` +
        `🕛 Kal subah reset ho jayega.\n\n` +
        `_Owner/SuperOwner ko koi limit nahi hoti._` +
        FOOTER
      );
    }

    if (!input) {
      return reply(
        `🇵🇰 *Pakistan SIM Owner Lookup*\n\n` +
        `*Usage:* ${prefix}simowner <number>\n\n` +
        `*Supported formats:*\n` +
        `▸ \`03001234567\`\n` +
        `▸ \`0300-1234567\`\n` +
        `▸ \`+923001234567\`\n` +
        `▸ \`923001234567\`\n\n` +
        `*Examples:*\n` +
        `▸ \`${prefix}simowner 03346741532\`\n` +
        `▸ \`${prefix}callerid 03001234567\`\n` +
        `▸ \`${prefix}truecaller +923451234567\`` +
        FOOTER
      );
    }

    await react('🔍');

    // ── Normalise ────────────────────────────────────────────────────────────
    const norm = normalise(input);

    // Validate — must be 12 digits starting with 92
    if (!/^92[3][0-9]{9}$/.test(norm)) {
      await react('❌');
      return reply(
        `❌ *Invalid Number*\n\n` +
        `_"${input}"_ valid Pakistan mobile number nahi hai.\n\n` +
        `Pakistan mobile numbers 03XXXXXXXXX (11 digits) hote hain.\n` +
        `Example: \`03001234567\`` +
        FOOTER
      );
    }

    const display  = toDisplay(norm);
    const e164     = '+' + norm;
    const operator = getOperator(norm);
    const opColor  = operator ? (OP_COLORS[operator] || '📱') : '📱';

    try {
      // Phone param without country code (API wants just the local digits)
      const phoneParam = norm.slice(2); // 3346741532
      const apiRes = await tcLookup(phoneParam, 'PK');

      if (!apiRes?.status || !apiRes?.data?.length) {
        await react('⚠️');
        return reply(
          `⚠️ *No Record Found*\n\n` +
          `📱 *Number:* ${display}\n` +
          `🌐 *E.164:* ${e164}\n` +
          `${opColor} *Operator:* ${operator || 'Unknown'}\n\n` +
          `_This number has no Truecaller record._` +
          FOOTER
        );
      }

      const r = apiRes.data[0];

      // ── Extract fields ──────────────────────────────────────────────────────
      const name     = r.name || 'Unknown';
      const score    = parseFloat(r.score || 0).toFixed(2);

      const ph       = r.phones?.[0] || {};
      const carrier  = ph.carrier    || operator || '';
      const numType  = ph.numberType || 'MOBILE';

      const addr     = r.addresses?.[0] || {};
      const city     = addr.address !== 'PK' ? addr.address : '';

      const emails   = r.internetAddresses || [];
      const email    = emails[0]?.id || '';

      const badges   = (r.badges || []).join(', ');

      // Spam info — can be in phones[0] or top-level spamScore
      const spamData   = r.spamScore || {};
      const spamSc     = spamData.spamScore ?? ph.spamScore ?? 0;
      const spamType   = spamData.spamType  || ph.spamType  || '';
      const isSpam     = spamSc < -10;

      // ── Build result ────────────────────────────────────────────────────────
      let out =
        `🇵🇰 *SIM Owner Info*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📱 *Number:*   ${display}\n` +
        `🌐 *E.164:*    ${e164}\n` +
        `👤 *Name:*     *${name}*\n`;

      if (carrier || operator) out += `${opColor} *Operator:* ${carrier || operator}\n`;
      if (numType)             out += `📋 *Type:*     ${numType}\n`;
      if (city)                out += `📍 *City:*     ${city}\n`;
      if (email)               out += `📧 *Email:*    ${email}\n`;
      if (badges)              out += `🏅 *Badges:*   ${badges}\n`;

      out += `⭐ *Score:*    ${score}/1.0\n\n`;

      // Spam section
      if (isSpam) {
        out +=
          `⚠️ *SPAM ALERT!*\n` +
          `${spamBar(spamSc)} (${Math.abs(spamSc)} pts)\n` +
          (spamType ? `🔴 *Type:* ${spamType}\n` : '');
      } else {
        out += `✅ *Spam:* Clean\n`;
      }

      out +=
        `\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ _Source: Truecaller crowdsourced DB. Accuracy depends on registrations._\n\n` +
        `📌 *Disclaimer:* Ye result 100% accurate nahi hota. Ye tool sirf *educational purpose* ke liye hai. Kisi bhi illegal kaam ke liye use mat karo.` +
        FOOTER;

      // Send with profile pic if possible (WhatsApp)
      try {
        const waJid = norm + '@s.whatsapp.net';
        const ppUrl = await sock.profilePictureUrl(waJid, 'image').catch(() => null);
        if (ppUrl) {
          const { getBuffer } = await import('../../lib/helper.js');
          const imgBuf = await getBuffer(ppUrl).catch(() => null);
          if (imgBuf) {
            await sock.sendMessage(jid, { image: imgBuf, caption: out }, { quoted: msg });
            return await react('✅');
          }
        }
      } catch {}

      // Fallback — text only
      await reply(out);
      await react('✅');

    } catch (err) {
      await react('❌');

      const status = err?.response?.status;
      const errMsg = err?.response?.data?.message || err.message || 'Unknown error';

      if (status === 429) {
        return reply(
          `❌ *Rate Limit Exceeded*\n\n` +
          `_RapidAPI daily limit khatam ho gai._\n` +
          `Kal dobara try karo ya plan upgrade karo.\n\n` +
          `rapidapi.com → Truecaller API → Pricing` +
          FOOTER
        );
      }
      if (status === 403 || status === 401) {
        return reply(
          `❌ *API Key Invalid / Expired*\n\n` +
          `RapidAPI key check karo aur \`RAPIDAPI_TRUECALLER_KEY\` secret update karo.` +
          FOOTER
        );
      }

      await reply(
        `❌ *Lookup Failed*\n\n_${String(errMsg).slice(0, 200)}_` +
        FOOTER
      );
    }
  },
};
