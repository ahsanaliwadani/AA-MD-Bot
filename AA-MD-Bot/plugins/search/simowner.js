// ============================================
// AA MD Bot — Pakistan SIM Owner Lookup 🇵🇰
// Developer: Ahsan Ali | AA Mods
//
// Uses Truecaller unofficial API (search confirmed working)
// Token setup: .simowner setup  →  step-by-step instructions
// Commands: .simowner  .callerid  .truecaller  .simname
// ============================================

import axios from 'axios';
import { db, saveNow } from '../../lib/database.js';

const FOOTER = '\n\n> 🇵🇰 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// Truecaller API constants (reverse-engineered, widely documented)
const TC_SEARCH  = 'https://search5-noneu.truecaller.com/v2/search';
const TC_HEADERS = {
  'clientId':     'phone-truecaller-android-7',
  'clientSecret': 'lvc22mp3l1sfv6ujg83rd17btt',
  'User-Agent':   'Truecaller/11.75.5 (Android;10)',
};

// ── Get stored token (env secret takes priority over db) ────────────────────
function getToken() {
  return process.env.TRUECALLER_TOKEN || db.settings.getValue('truecallerToken') || null;
}

// ── Normalise number to +92... E.164 ────────────────────────────────────────
function toE164(raw) {
  let n = raw.replace(/[\s\-.()+]/g, '');
  if (n.startsWith('0092')) n = '92' + n.slice(4);
  else if (n.startsWith('92') && n.length === 12) { /* already good */ }
  else if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
  return '+' + n.replace(/^\+/, '');
}

function isValidPakNum(e164) {
  return /^\+923[0-9]{9}$/.test(e164) || /^\+9245[5-8][0-9]{7}$/.test(e164);
}

// ── Truecaller search ────────────────────────────────────────────────────────
async function truecallerSearch(e164, token) {
  const { data } = await axios.get(TC_SEARCH, {
    params: {
      q:           e164,
      countryCode: 'PK',
      type:        4,
      locAddr:     '',
      encoding:    'json',
    },
    headers: {
      ...TC_HEADERS,
      'Authorization': `Bearer ${token}`,
    },
    timeout: 12000,
  });
  return data;
}

// ── Setup instructions text ──────────────────────────────────────────────────
function setupText(prefix) {
  return (
    `🔑 *Truecaller Token Setup*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `*Step 1* — Oracle server par ye Python script chalao:\n\n` +
    `\`\`\`\npip3 install requests\n\`\`\`\n\n` +
    `\`\`\`python\nimport requests, uuid, json\n\n` +
    `INSTALL_ID = str(uuid.uuid4())\n` +
    `HDR = {\n` +
    `  "clientId": "phone-truecaller-android-7",\n` +
    `  "clientSecret": "lvc22mp3l1sfv6ujg83rd17btt",\n` +
    `  "Content-Type": "application/json"\n` +
    `}\n\n` +
    `phone = input("Phone (+92...): ")\n` +
    `r1 = requests.post(\n` +
    `  "https://account-asia-south1.truecaller.com/v2/sendOnboardingOtp",\n` +
    `  headers=HDR,\n` +
    `  json={"phoneNumber": phone, "countryCode": "PK"}\n` +
    `)\n` +
    `print("OTP sent:", r1.json())\n\n` +
    `otp = input("OTP: ")\n` +
    `r2 = requests.post(\n` +
    `  "https://account-asia-south1.truecaller.com/v2/verifyOnboardingOtp",\n` +
    `  headers=HDR,\n` +
    `  json={"phoneNumber": phone, "otp": otp,\n` +
    `        "installationId": INSTALL_ID}\n` +
    `)\n` +
    `d = r2.json()\n` +
    `print("TOKEN:", d.get("tokenV2") or d.get("token") or json.dumps(d))\n` +
    `\`\`\`\n\n` +
    `*Step 2* — Token milne ke baad:\n` +
    `▸ Replit mein *TRUECALLER_TOKEN* secret set karo\n` +
    `▸ *Ya* WhatsApp mein yeh command chalaao:\n` +
    `  \`${prefix}simtoken <paste_token_here>\`\n\n` +
    `*Step 3* — Token save hone ke baad:\n` +
    `  \`${prefix}simowner 03001234567\`\n\n` +
    `⚠️ _Sirf apne number par OTP lo. Token 6+ months chalta hai._` +
    FOOTER
  );
}

export default {
  command:     'simowner',
  alias:       ['callerid', 'truecaller', 'simname', 'tcall', 'ownersim', 'simtoken'],
  description: 'Pakistan SIM owner name via Truecaller 🇵🇰',
  category:    'search',
  usage:       '.simowner <number>',

  async execute({ text, reply, react, prefix, fromMe, msg, jid, sock }) {
    const input = (text || '').trim();

    // ── .simowner setup ──────────────────────────────────────────────────────
    if (!input || input.toLowerCase() === 'setup' || input.toLowerCase() === 'help') {
      const token = getToken();
      if (!input && !token) {
        return reply(
          `🇵🇰 *Pakistan SIM Owner Lookup*\n\n` +
          `❌ *Token not set!*\n\n` +
          `Truecaller token ek baar set karna hoga.\n` +
          `Setup instructions ke liye:\n` +
          `▸ \`${prefix}simowner setup\`\n\n` +
          `*Usage (after setup):*\n` +
          `▸ \`${prefix}simowner 03001234567\`\n` +
          `▸ \`${prefix}simowner +923001234567\`\n` +
          `▸ \`${prefix}callerid 03451234567\`` +
          FOOTER
        );
      }
      if (input.toLowerCase() === 'setup' || !token) {
        return reply(setupText(prefix));
      }
    }

    // ── .simtoken <token> — save token to db ─────────────────────────────────
    if (input.toLowerCase().startsWith('token ') || input.toLowerCase().startsWith('settoken ')) {
      if (!fromMe) return;
      const tok = input.split(' ').slice(1).join('').trim();
      if (!tok || tok.length < 20) {
        return reply(`❌ Invalid token. Token kam se kam 20 characters ka hona chahiye.${FOOTER}`);
      }
      db.settings.setValue('truecallerToken', tok);
      await saveNow('settings');
      await react('✅');
      return reply(
        `✅ *Truecaller Token Saved!*\n\n` +
        `Token: \`${tok.slice(0, 8)}...${tok.slice(-4)}\`\n\n` +
        `Ab lookup karo:\n▸ \`${prefix}simowner 03001234567\`` +
        FOOTER
      );
    }

    // ── Main lookup ──────────────────────────────────────────────────────────
    const token = getToken();
    if (!token) {
      return reply(
        `❌ *Token not configured!*\n\n` +
        `Setup ke liye: \`${prefix}simowner setup\`` +
        FOOTER
      );
    }

    await react('🔍');

    let e164;
    try {
      e164 = toE164(input);
      if (!e164.startsWith('+')) throw new Error('bad');
    } catch {
      await react('❌');
      return reply(
        `❌ *Invalid number format*\n\n` +
        `Pakistan mobile number format:\n` +
        `▸ \`03001234567\`\n` +
        `▸ \`+923001234567\`` +
        FOOTER
      );
    }

    try {
      const data = await truecallerSearch(e164, token);

      // ── Parse response ─────────────────────────────────────────────────────
      const results = data?.data || [];
      if (!results.length) {
        await react('⚠️');
        return reply(
          `⚠️ *No Info Found*\n\n` +
          `📱 *Number:* ${e164}\n\n` +
          `_This number has no Truecaller record. The person may not have Truecaller installed or their number is private._` +
          FOOTER
        );
      }

      const r = results[0];

      // Name
      const firstName = r.name?.first || '';
      const lastName  = r.name?.last  || '';
      const fullName  = r.name || (firstName + ' ' + lastName).trim() || 'Unknown';
      const name      = typeof fullName === 'string' ? fullName : (fullName.first + ' ' + (fullName.last || '')).trim();

      // Phone details
      const phones    = r.phones || [];
      const phone0    = phones[0] || {};
      const carrier   = phone0.carrier     || phone0.network    || '';
      const numType   = phone0.numberType  || phone0.type       || '';
      const spamScore = r.spamInfo?.score  || r.score?.spamScore || 0;
      const spamType  = r.spamInfo?.spamType || '';

      // Address
      const addrs  = r.addresses || [];
      const addr0  = addrs[0] || {};
      const city   = addr0.city         || '';
      const region = addr0.countryCode  || 'PK';

      // Email / social
      const emails  = r.internetAddresses || [];
      const email0  = emails[0]?.id || '';

      // Tags / label
      const tags = (r.tags || []).join(', ');

      // About / bio
      const about = r.about || '';

      // Build response
      let msg =
        `🇵🇰 *SIM Owner Info*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📱 *Number:* ${e164}\n` +
        `👤 *Name:* ${name || 'Unknown'}\n`;

      if (carrier)  msg += `📡 *Carrier:* ${carrier}\n`;
      if (numType)  msg += `📋 *Type:* ${numType}\n`;
      if (city)     msg += `📍 *City:* ${city}\n`;
      if (email0)   msg += `📧 *Email:* ${email0}\n`;
      if (about)    msg += `💬 *Bio:* ${about.slice(0, 80)}\n`;
      if (tags)     msg += `🏷️ *Tags:* ${tags}\n`;

      // Spam warning
      if (spamScore > 0) {
        const bar = '🔴'.repeat(Math.min(5, Math.ceil(spamScore / 2)));
        msg += `\n⚠️ *Spam Score:* ${bar} (${spamScore}/10)`;
        if (spamType) msg += ` — ${spamType}`;
        msg += '\n';
      } else {
        msg += `\n✅ *Spam:* Clean\n`;
      }

      // Extra results count
      if (results.length > 1) {
        msg += `\n📊 _${results.length} Truecaller records found — showing top match_`;
      }

      msg += `\n━━━━━━━━━━━━━━━━━━━━━`;
      msg += `\n⚠️ _Source: Truecaller crowdsourced DB. Name accuracy depends on user registrations._`;
      msg += FOOTER;

      await react('✅');
      await reply(msg);

    } catch (err) {
      await react('❌');

      // Handle token expiry
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        return reply(
          `❌ *Token Expired / Invalid*\n\n` +
          `Truecaller token expire ho gaya.\n` +
          `Naya token lo: \`${prefix}simowner setup\`` +
          FOOTER
        );
      }

      await reply(
        `❌ *Lookup Failed*\n\n` +
        `_${(err?.response?.data?.message || err.message || 'Unknown error').slice(0, 150)}_` +
        FOOTER
      );
    }
  },
};
