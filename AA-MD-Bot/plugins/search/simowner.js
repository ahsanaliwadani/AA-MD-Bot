// ============================================
// AA MD Bot — International SIM / Caller ID Lookup
// Developer: Ahsan Ali | AA Mods
//
// Source: Truecaller via RapidAPI (truecaller4.p.rapidapi.com)
// Commands: .simowner .callerid .truecaller .simname .siminfo
// ============================================

import axios from 'axios';
import config from '../../config.js';

const FOOTER = '\n\n> 🌍 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// ── Daily rate limit ─────────────────────────────────────────────────────────
const OWNER_DAILY_LIMIT = 2;
const _rlMap = new Map(); // senderJid → { date: 'YYYY-MM-DD', count: N }

function isSuperOwnerJid(senderJid) {
  const num = (senderJid || '').split('@')[0].split(':')[0];
  return String(config.superOwner || '') !== '' && num === String(config.superOwner);
}

function checkLimit(senderJid) {
  if (isSuperOwnerJid(senderJid)) return { allowed: true, unlimited: true };
  const today = new Date().toISOString().slice(0, 10);
  const rec   = _rlMap.get(senderJid);
  if (!rec || rec.date !== today) {
    _rlMap.set(senderJid, { date: today, count: 1 });
    return { allowed: true, remaining: OWNER_DAILY_LIMIT - 1 };
  }
  if (rec.count >= OWNER_DAILY_LIMIT) return { allowed: false, remaining: 0 };
  rec.count += 1;
  return { allowed: true, remaining: OWNER_DAILY_LIMIT - rec.count };
}

// RapidAPI key
function getApiKey() {
  return process.env.RAPIDAPI_TRUECALLER_KEY
    || process.env.RAPIDAPI_KEY
    || '8eb4831202mshebcbbd8b96ccd71p129820jsn9b7b3f11c188';
}

// ── Country code → ISO map (top 50+ countries by WhatsApp usage) ────────────
const CC_MAP = {
  '1':   'US',  // USA / Canada
  '7':   'RU',  // Russia / Kazakhstan
  '20':  'EG',  // Egypt
  '27':  'ZA',  // South Africa
  '31':  'NL',  // Netherlands
  '32':  'BE',  // Belgium
  '33':  'FR',  // France
  '34':  'ES',  // Spain
  '39':  'IT',  // Italy
  '40':  'RO',  // Romania
  '44':  'GB',  // UK
  '46':  'SE',  // Sweden
  '47':  'NO',  // Norway
  '48':  'PL',  // Poland
  '49':  'DE',  // Germany
  '51':  'PE',  // Peru
  '52':  'MX',  // Mexico
  '54':  'AR',  // Argentina
  '55':  'BR',  // Brazil
  '57':  'CO',  // Colombia
  '58':  'VE',  // Venezuela
  '60':  'MY',  // Malaysia
  '62':  'ID',  // Indonesia
  '63':  'PH',  // Philippines
  '64':  'NZ',  // New Zealand
  '65':  'SG',  // Singapore
  '66':  'TH',  // Thailand
  '81':  'JP',  // Japan
  '82':  'KR',  // South Korea
  '84':  'VN',  // Vietnam
  '86':  'CN',  // China
  '90':  'TR',  // Turkey
  '91':  'IN',  // India
  '92':  'PK',  // Pakistan
  '93':  'AF',  // Afghanistan
  '94':  'LK',  // Sri Lanka
  '95':  'MM',  // Myanmar
  '98':  'IR',  // Iran
  '212': 'MA',  // Morocco
  '213': 'DZ',  // Algeria
  '216': 'TN',  // Tunisia
  '218': 'LY',  // Libya
  '220': 'GM',  // Gambia
  '221': 'SN',  // Senegal
  '223': 'ML',  // Mali
  '224': 'GN',  // Guinea
  '225': 'CI',  // Ivory Coast
  '227': 'NE',  // Niger
  '228': 'TG',  // Togo
  '229': 'BJ',  // Benin
  '230': 'MU',  // Mauritius
  '231': 'LR',  // Liberia
  '232': 'SL',  // Sierra Leone
  '233': 'GH',  // Ghana
  '234': 'NG',  // Nigeria
  '236': 'CF',  // Central African Republic
  '237': 'CM',  // Cameroon
  '238': 'CV',  // Cape Verde
  '239': 'ST',  // Sao Tome
  '240': 'GQ',  // Equatorial Guinea
  '241': 'GA',  // Gabon
  '242': 'CG',  // Congo
  '243': 'CD',  // DR Congo
  '244': 'AO',  // Angola
  '245': 'GW',  // Guinea-Bissau
  '248': 'SC',  // Seychelles
  '249': 'SD',  // Sudan
  '250': 'RW',  // Rwanda
  '251': 'ET',  // Ethiopia
  '252': 'SO',  // Somalia
  '253': 'DJ',  // Djibouti
  '254': 'KE',  // Kenya
  '255': 'TZ',  // Tanzania
  '256': 'UG',  // Uganda
  '257': 'BI',  // Burundi
  '258': 'MZ',  // Mozambique
  '260': 'ZM',  // Zambia
  '261': 'MG',  // Madagascar
  '263': 'ZW',  // Zimbabwe
  '264': 'NA',  // Namibia
  '265': 'MW',  // Malawi
  '266': 'LS',  // Lesotho
  '267': 'BW',  // Botswana
  '268': 'SZ',  // Eswatini
  '269': 'KM',  // Comoros
  '290': 'SH',  // Saint Helena
  '291': 'ER',  // Eritrea
  '297': 'AW',  // Aruba
  '298': 'FO',  // Faroe Islands
  '299': 'GL',  // Greenland
  '350': 'GI',  // Gibraltar
  '351': 'PT',  // Portugal
  '352': 'LU',  // Luxembourg
  '353': 'IE',  // Ireland
  '354': 'IS',  // Iceland
  '355': 'AL',  // Albania
  '356': 'MT',  // Malta
  '357': 'CY',  // Cyprus
  '358': 'FI',  // Finland
  '359': 'BG',  // Bulgaria
  '370': 'LT',  // Lithuania
  '371': 'LV',  // Latvia
  '372': 'EE',  // Estonia
  '373': 'MD',  // Moldova
  '374': 'AM',  // Armenia
  '375': 'BY',  // Belarus
  '376': 'AD',  // Andorra
  '377': 'MC',  // Monaco
  '380': 'UA',  // Ukraine
  '381': 'RS',  // Serbia
  '382': 'ME',  // Montenegro
  '385': 'HR',  // Croatia
  '386': 'SI',  // Slovenia
  '387': 'BA',  // Bosnia
  '389': 'MK',  // North Macedonia
  '420': 'CZ',  // Czech Republic
  '421': 'SK',  // Slovakia
  '423': 'LI',  // Liechtenstein
  '501': 'BZ',  // Belize
  '502': 'GT',  // Guatemala
  '503': 'SV',  // El Salvador
  '504': 'HN',  // Honduras
  '505': 'NI',  // Nicaragua
  '506': 'CR',  // Costa Rica
  '507': 'PA',  // Panama
  '509': 'HT',  // Haiti
  '591': 'BO',  // Bolivia
  '592': 'GY',  // Guyana
  '593': 'EC',  // Ecuador
  '595': 'PY',  // Paraguay
  '597': 'SR',  // Suriname
  '598': 'UY',  // Uruguay
  '670': 'TL',  // Timor-Leste
  '672': 'NF',  // Norfolk Island
  '673': 'BN',  // Brunei
  '674': 'NR',  // Nauru
  '675': 'PG',  // Papua New Guinea
  '676': 'TO',  // Tonga
  '677': 'SB',  // Solomon Islands
  '678': 'VU',  // Vanuatu
  '679': 'FJ',  // Fiji
  '680': 'PW',  // Palau
  '682': 'CK',  // Cook Islands
  '685': 'WS',  // Samoa
  '686': 'KI',  // Kiribati
  '688': 'TV',  // Tuvalu
  '689': 'PF',  // French Polynesia
  '690': 'TK',  // Tokelau
  '691': 'FM',  // Micronesia
  '692': 'MH',  // Marshall Islands
  '850': 'KP',  // North Korea
  '852': 'HK',  // Hong Kong
  '853': 'MO',  // Macau
  '855': 'KH',  // Cambodia
  '856': 'LA',  // Laos
  '880': 'BD',  // Bangladesh
  '886': 'TW',  // Taiwan
  '960': 'MV',  // Maldives
  '961': 'LB',  // Lebanon
  '962': 'JO',  // Jordan
  '963': 'SY',  // Syria
  '964': 'IQ',  // Iraq
  '965': 'KW',  // Kuwait
  '966': 'SA',  // Saudi Arabia
  '967': 'YE',  // Yemen
  '968': 'OM',  // Oman
  '970': 'PS',  // Palestine
  '971': 'AE',  // UAE
  '972': 'IL',  // Israel
  '973': 'BH',  // Bahrain
  '974': 'QA',  // Qatar
  '975': 'BT',  // Bhutan
  '976': 'MN',  // Mongolia
  '977': 'NP',  // Nepal
  '992': 'TJ',  // Tajikistan
  '993': 'TM',  // Turkmenistan
  '994': 'AZ',  // Azerbaijan
  '995': 'GE',  // Georgia
  '996': 'KG',  // Kyrgyzstan
  '998': 'UZ',  // Uzbekistan
};

// ── Pakistan operator map ────────────────────────────────────────────────────
const PK_OPERATORS = {
  '030': 'Jazz (Mobilink)', '031': 'Zong (China Mobile)',
  '032': 'Jazz (Warid)',    '033': 'Ufone (PTCL)',
  '034': 'Telenor',        '045': 'SCO (SCOM)',
};
const OP_COLORS = {
  'Jazz (Mobilink)': '🟠', 'Jazz (Warid)': '🟠',
  'Zong (China Mobile)': '🔵', 'Ufone (PTCL)': '🟢',
  'Telenor': '🔴', 'SCO (SCOM)': '🟣',
};

// ── Normalise to E.164 digits (no +) ─────────────────────────────────────────
function normalise(raw) {
  let n = raw.replace(/[\s\-.()+]/g, '');
  if (n.startsWith('00')) n = n.slice(2);          // 0092... → 92...
  else if (n.startsWith('0') && n.length <= 11) {
    // Local format — can't guess country here, just strip leading 0
    n = n.slice(1);
  }
  return n;
}

// ── Detect country from E.164 digits ─────────────────────────────────────────
function detectCountry(norm) {
  // Try 3-digit prefix first, then 2-digit, then 1-digit
  for (const len of [3, 2, 1]) {
    const prefix = norm.slice(0, len);
    if (CC_MAP[prefix]) return { countryCode: CC_MAP[prefix], ccLen: len };
  }
  return { countryCode: 'US', ccLen: 1 }; // fallback
}

// ── Pakistan-specific operator info ──────────────────────────────────────────
function getPkOperator(norm) {
  if (!norm.startsWith('92')) return null;
  const local = '0' + norm.slice(2);
  return PK_OPERATORS[local.slice(0, 3)] || null;
}

// ── Spam bar ─────────────────────────────────────────────────────────────────
function spamBar(score) {
  const abs   = Math.abs(score || 0);
  const level = Math.min(5, Math.ceil(abs / 20));
  return '🔴'.repeat(level) + '⚪'.repeat(5 - level);
}

// ── Main API call ─────────────────────────────────────────────────────────────
async function tcLookup(phone, countryCode) {
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
  description: 'International SIM / caller ID lookup via Truecaller 🌍',
  category:    'search',
  ownerOnly:   true,
  usage:       '.simowner <number>',

  async execute({ text, reply, react, prefix, sock, jid, msg, senderJid }) {
    const input = (text || '').trim();

    // ── Rate limit ────────────────────────────────────────────────────────────
    const rl = checkLimit(senderJid);
    if (!rl.allowed) {
      return reply(
        `⏳ *Daily Limit Reached*\n\n` +
        `You have used all *${OWNER_DAILY_LIMIT}* SIM owner lookups for today.\n` +
        `Limit resets at midnight.\n\n` +
        `_SuperOwner has no daily limit._` +
        FOOTER
      );
    }

    if (!input) {
      return reply(
        `🌍 *International SIM Owner Lookup*\n\n` +
        `*Usage:* ${prefix}simowner <number>\n\n` +
        `*Supported formats:*\n` +
        `▸ \`+923001234567\`  ← Pakistan (with +)\n` +
        `▸ \`923001234567\`   ← Pakistan (with country code)\n` +
        `▸ \`03001234567\`    ← Pakistan local\n` +
        `▸ \`+917001234567\`  ← India\n` +
        `▸ \`+971501234567\`  ← UAE\n` +
        `▸ \`+4412345678901\` ← UK\n` +
        `▸ \`+12025551234\`   ← USA\n\n` +
        `*Examples:*\n` +
        `▸ \`${prefix}simowner +923346741532\`\n` +
        `▸ \`${prefix}callerid +917001234567\`\n` +
        `▸ \`${prefix}truecaller 03001234567\`` +
        FOOTER
      );
    }

    await react('🔍');

    // ── Normalise ─────────────────────────────────────────────────────────────
    const norm = normalise(input);

    // Must have at least 7 digits
    if (!/^\d{7,15}$/.test(norm)) {
      await react('❌');
      return reply(
        `❌ *Invalid Number*\n\n` +
        `_"${input}"_ doesn't look like a valid phone number.\n\n` +
        `Please include the country code:\n` +
        `▸ \`+923001234567\` (Pakistan)\n` +
        `▸ \`+917001234567\` (India)\n` +
        `▸ \`+971501234567\` (UAE)` +
        FOOTER
      );
    }

    // ── Detect country ────────────────────────────────────────────────────────
    const { countryCode, ccLen } = detectCountry(norm);
    const phoneParam = norm.slice(ccLen);   // digits after country code
    const e164       = '+' + norm;
    const isPK       = countryCode === 'PK';
    const pkOperator = isPK ? getPkOperator(norm) : null;
    const opColor    = pkOperator ? (OP_COLORS[pkOperator] || '📱') : '📱';

    try {
      const apiRes = await tcLookup(phoneParam, countryCode);

      if (!apiRes?.status || !apiRes?.data?.length) {
        await react('⚠️');
        return reply(
          `⚠️ *No Record Found*\n\n` +
          `📱 *Number:* ${e164}\n` +
          `🌍 *Country:* ${countryCode}\n` +
          (pkOperator ? `${opColor} *Operator:* ${pkOperator}\n` : '') +
          `\n_This number has no Truecaller record._` +
          FOOTER
        );
      }

      const r = apiRes.data[0];

      // ── Extract fields ────────────────────────────────────────────────────
      const name    = r.name || 'Unknown';
      const score   = parseFloat(r.score || 0).toFixed(2);

      const ph      = r.phones?.[0] || {};
      const carrier = ph.carrier || pkOperator || '';
      const numType = ph.numberType || 'MOBILE';

      const addr    = r.addresses?.[0] || {};
      const city    = (addr.address && addr.address !== countryCode) ? addr.address : '';
      const country = addr.countryCode || countryCode;

      const emails  = r.internetAddresses || [];
      const email   = emails[0]?.id || '';

      const badges  = (r.badges || []).join(', ');

      const spamData  = r.spamScore || {};
      const spamSc    = spamData.spamScore ?? ph.spamScore ?? 0;
      const spamType  = spamData.spamType  || ph.spamType  || '';
      const isSpam    = spamSc < -10;

      // ── Build result ──────────────────────────────────────────────────────
      let out =
        `🌍 *SIM Owner Info*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📱 *Number:*   ${e164}\n` +
        `🌐 *Country:*  ${country}\n` +
        `👤 *Name:*     *${name}*\n`;

      if (carrier || pkOperator)  out += `${opColor} *Operator:* ${carrier || pkOperator}\n`;
      if (numType)                 out += `📋 *Type:*     ${numType}\n`;
      if (city)                    out += `📍 *City:*     ${city}\n`;
      if (email)                   out += `📧 *Email:*    ${email}\n`;
      if (badges)                  out += `🏅 *Badges:*   ${badges}\n`;

      out += `⭐ *Score:*    ${score}/1.0\n\n`;

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
        `⚠️ _Source: Truecaller crowdsourced DB. Accuracy depends on user registrations._\n\n` +
        `📌 *Disclaimer:* Results may not be 100% accurate. For educational purposes only.` +
        FOOTER;

      // Send with profile pic if available
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

      await reply(out);
      await react('✅');

    } catch (err) {
      await react('❌');

      const status = err?.response?.status;
      const errMsg = err?.response?.data?.message || err.message || 'Unknown error';

      if (status === 429) {
        return reply(
          `❌ *Rate Limit Exceeded*\n\n` +
          `_RapidAPI daily limit reached._\n` +
          `Try again tomorrow or upgrade your plan.\n\n` +
          `rapidapi.com → Truecaller API → Pricing` +
          FOOTER
        );
      }
      if (status === 403 || status === 401) {
        return reply(
          `❌ *API Key Invalid / Expired*\n\n` +
          `Update \`RAPIDAPI_TRUECALLER_KEY\` in Replit Secrets.` +
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
