// ============================================
// AA MD Bot — SIM / Number Lookup
// Developer: Ahsan Ali | AA Mods
//
// Mode 1 (Truecaller): if RAPIDAPI_TRUECALLER_KEY is set & valid
// Mode 2 (WA-native) : always works — no API key needed
//   • onWhatsApp check, push name, profile pic, business profile
//   • Local PK operator detection
// ============================================

import axios from 'axios';
import * as truecallerjs from 'truecallerjs';
import config from '../../config.js';

const FOOTER = '\n\n> 🌍 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';
const DEMO_KEY = '8eb4831202mshebcbbd8b96ccd71p129820jsn9b7b3f11c188';

// ── Country code → ISO map ───────────────────────────────────────────────────
const CC_MAP = {
  '1':'US','7':'RU','20':'EG','27':'ZA','31':'NL','32':'BE','33':'FR',
  '34':'ES','39':'IT','40':'RO','44':'GB','46':'SE','47':'NO','48':'PL',
  '49':'DE','51':'PE','52':'MX','54':'AR','55':'BR','57':'CO','58':'VE',
  '60':'MY','62':'ID','63':'PH','64':'NZ','65':'SG','66':'TH','81':'JP',
  '82':'KR','84':'VN','86':'CN','90':'TR','91':'IN','92':'PK','93':'AF',
  '94':'LK','95':'MM','98':'IR','212':'MA','213':'DZ','216':'TN','218':'LY',
  '220':'GM','221':'SN','223':'ML','224':'GN','225':'CI','227':'NE','228':'TG',
  '229':'BJ','230':'MU','231':'LR','232':'SL','233':'GH','234':'NG','236':'CF',
  '237':'CM','238':'CV','239':'ST','240':'GQ','241':'GA','242':'CG','243':'CD',
  '244':'AO','245':'GW','248':'SC','249':'SD','250':'RW','251':'ET','252':'SO',
  '253':'DJ','254':'KE','255':'TZ','256':'UG','257':'BI','258':'MZ','260':'ZM',
  '261':'MG','263':'ZW','264':'NA','265':'MW','266':'LS','267':'BW','268':'SZ',
  '269':'KM','290':'SH','291':'ER','297':'AW','298':'FO','299':'GL','350':'GI',
  '351':'PT','352':'LU','353':'IE','354':'IS','355':'AL','356':'MT','357':'CY',
  '358':'FI','359':'BG','370':'LT','371':'LV','372':'EE','373':'MD','374':'AM',
  '375':'BY','376':'AD','377':'MC','380':'UA','381':'RS','382':'ME','385':'HR',
  '386':'SI','387':'BA','389':'MK','420':'CZ','421':'SK','423':'LI','501':'BZ',
  '502':'GT','503':'SV','504':'HN','505':'NI','506':'CR','507':'PA','509':'HT',
  '591':'BO','592':'GY','593':'EC','595':'PY','597':'SR','598':'UY','670':'TL',
  '673':'BN','675':'PG','676':'TO','677':'SB','678':'VU','679':'FJ','689':'PF',
  '852':'HK','853':'MO','855':'KH','856':'LA','880':'BD','886':'TW','960':'MV',
  '961':'LB','962':'JO','963':'SY','964':'IQ','965':'KW','966':'SA','967':'YE',
  '968':'OM','970':'PS','971':'AE','972':'IL','973':'BH','974':'QA','975':'BT',
  '976':'MN','977':'NP','992':'TJ','993':'TM','994':'AZ','995':'GE','996':'KG',
  '998':'UZ',
};

const CC_NAMES = {
  'US':'United States','GB':'United Kingdom','PK':'Pakistan','IN':'India',
  'SA':'Saudi Arabia','AE':'UAE','MY':'Malaysia','ID':'Indonesia','TR':'Turkey',
  'EG':'Egypt','NG':'Nigeria','BD':'Bangladesh','PH':'Philippines','KW':'Kuwait',
  'QA':'Qatar','BH':'Bahrain','OM':'Oman','JO':'Jordan','IQ':'Iraq','LB':'Lebanon',
  'SY':'Syria','AF':'Afghanistan','IR':'Iran','LK':'Sri Lanka','MM':'Myanmar',
  'NP':'Nepal','KH':'Cambodia','VN':'Vietnam','TH':'Thailand','SG':'Singapore',
  'CN':'China','JP':'Japan','KR':'South Korea','RU':'Russia','DE':'Germany',
  'FR':'France','IT':'Italy','ES':'Spain','BR':'Brazil','MX':'Mexico',
  'AR':'Argentina','ZA':'South Africa','KE':'Kenya','GH':'Ghana','MA':'Morocco',
  'DZ':'Algeria','TN':'Tunisia',
};

// ── Pakistan operator map ────────────────────────────────────────────────────
const PK_OPERATORS = {
  '030':'Jazz (Mobilink)','031':'Zong (China Mobile)',
  '032':'Jazz (Warid)',   '033':'Ufone (PTCL)',
  '034':'Telenor',        '045':'SCO (SCOM)',
};
const OP_COLORS = {
  'Jazz (Mobilink)':'🟠','Jazz (Warid)':'🟠',
  'Zong (China Mobile)':'🔵','Ufone (PTCL)':'🟢',
  'Telenor':'🔴','SCO (SCOM)':'🟣',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalise(raw) {
  let n = raw.replace(/[\s\-.()+]/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0') && n.length <= 11) n = n.slice(1);
  return n;
}

function detectCountry(norm) {
  for (const len of [3, 2, 1]) {
    const prefix = norm.slice(0, len);
    if (CC_MAP[prefix]) return { countryCode: CC_MAP[prefix], ccLen: len };
  }
  return { countryCode: 'US', ccLen: 1 };
}

function getPkOperator(norm) {
  if (!norm.startsWith('92')) return null;
  const local = '0' + norm.slice(2);
  return PK_OPERATORS[local.slice(0, 3)] || null;
}

function hasValidKey() {
  const k = process.env.RAPIDAPI_TRUECALLER_KEY || process.env.RAPIDAPI_KEY || '';
  return k.length > 10 && k !== DEMO_KEY;
}

function hasInstallationId() {
  return !!(process.env.TRUECALLER_INSTALLATION_ID || '').trim();
}

// ── Truecaller via truecallerjs (installationId) ─────────────────────────────
async function tcjsLookup(e164, countryCode) {
  const installationId = (process.env.TRUECALLER_INSTALLATION_ID || '').trim();
  const res = await truecallerjs.search({
    number:         e164,
    countryCode:    countryCode,
    installationId: installationId,
  });
  return res.json();
}

// ── Truecaller via RapidAPI ──────────────────────────────────────────────────
async function tcLookup(phone, countryCode) {
  const key = process.env.RAPIDAPI_TRUECALLER_KEY || process.env.RAPIDAPI_KEY;
  const { data } = await axios.get('https://truecaller4.p.rapidapi.com/api/v1/getDetails', {
    params: { phone, countryCode },
    headers: {
      'x-rapidapi-host': 'truecaller4.p.rapidapi.com',
      'x-rapidapi-key':  key,
    },
    timeout: 12000,
  });
  return data;
}

// ── WhatsApp-native lookup (no API key needed) ───────────────────────────────
async function waLookup(norm, sock) {
  const waJid = norm + '@s.whatsapp.net';

  const [waCheck, bizProfile, ppUrl] = await Promise.allSettled([
    sock.onWhatsApp(norm).catch(() => null),
    sock.getBusinessProfile(waJid).catch(() => null),
    sock.profilePictureUrl(waJid, 'image').catch(() => null),
  ]);

  const waInfo   = waCheck.status === 'fulfilled'   ? waCheck.value   : null;
  const biz      = bizProfile.status === 'fulfilled' ? bizProfile.value : null;
  const ppLink   = ppUrl.status === 'fulfilled'      ? ppUrl.value     : null;

  const onWA     = Array.isArray(waInfo) ? waInfo.find(w => w?.jid?.includes(norm)) : null;
  const isOnWA   = !!onWA?.exists;
  const pushName = onWA?.notify || biz?.name || null;

  return { isOnWA, pushName, biz, ppLink };
}

export default {
  command:     'simowner',
  alias:       ['callerid', 'truecaller', 'simname', 'siminfo', 'tcall', 'ownersim', 'pkowner'],
  description: 'SIM / number lookup — WhatsApp info + operator (no API key needed)',
  category:    'search',
  ownerOnly:   true,
  usage:       '.simowner <number>',

  async execute({ text, reply, react, prefix, sock, jid, msg }) {
    const input = (text || '').trim();

    if (!input) {
      return reply(
        `🌍 *SIM / Number Lookup*\n\n` +
        `*Usage:* ${prefix}simowner <number>\n\n` +
        `*Supported formats:*\n` +
        `▸ \`+923001234567\`  ← Pakistan (with +)\n` +
        `▸ \`923001234567\`   ← Pakistan (with country code)\n` +
        `▸ \`03001234567\`    ← Pakistan local\n` +
        `▸ \`+917001234567\`  ← India\n` +
        `▸ \`+971501234567\`  ← UAE\n\n` +
        `*Examples:*\n` +
        `▸ \`${prefix}simowner +923346741532\`\n` +
        `▸ \`${prefix}simowner 03001234567\`` +
        FOOTER
      );
    }

    await react('🔍');

    const norm = normalise(input);
    if (!/^\d{7,15}$/.test(norm)) {
      await react('❌');
      return reply(
        `❌ *Invalid Number*\n\n` +
        `_"${input}"_ is not a valid phone number.\n\n` +
        `Please include country code:\n` +
        `▸ \`+923001234567\` (Pakistan)\n` +
        `▸ \`+917001234567\` (India)\n` +
        `▸ \`+971501234567\` (UAE)` + FOOTER
      );
    }

    const { countryCode, ccLen } = detectCountry(norm);
    const e164       = '+' + norm;
    const isPK       = countryCode === 'PK';
    const pkOperator = isPK ? getPkOperator(norm) : null;
    const opColor    = pkOperator ? (OP_COLORS[pkOperator] || '📱') : '📱';
    const ccName     = CC_NAMES[countryCode] || countryCode;

    // ── Priority 1: truecallerjs (installationId — free, no API key) ─────────
    if (hasInstallationId()) {
      try {
        const apiRes = await tcjsLookup(e164, countryCode);

        if (apiRes?.data?.length) {
          const r       = apiRes.data[0];
          const name    = r.name || 'Unknown';
          const ph      = r.phones?.[0] || {};
          const carrier = ph.carrier || pkOperator || '';
          const numType = ph.numberType || 'MOBILE';
          const addr    = r.addresses?.[0] || {};
          const city    = (addr.address && addr.address !== countryCode) ? addr.address : '';
          const country = addr.countryCode || countryCode;
          const email   = (r.internetAddresses || [])[0]?.id || '';
          const badges  = (r.badges || []).join(', ');
          const spamSc  = r.spamScore?.spamScore ?? ph.spamScore ?? 0;
          const spamType= r.spamScore?.spamType  || ph.spamType  || '';
          const isSpam  = spamSc < -10;
          const score   = parseFloat(r.score || 0).toFixed(2);

          let out =
            `🌍 *SIM Owner Info*  _(Truecaller)_\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📱 *Number:*   ${e164}\n` +
            `🌐 *Country:*  ${country}\n` +
            `👤 *Name:*     *${name}*\n`;

          if (carrier || pkOperator) out += `${opColor} *Operator:* ${carrier || pkOperator}\n`;
          if (numType)               out += `📋 *Type:*     ${numType}\n`;
          if (city)                  out += `📍 *City:*     ${city}\n`;
          if (email)                 out += `📧 *Email:*    ${email}\n`;
          if (badges)                out += `🏅 *Badges:*   ${badges}\n`;
          out += `⭐ *Score:*    ${score}/1.0\n\n`;

          if (isSpam) {
            const bar = '🔴'.repeat(Math.min(5, Math.ceil(Math.abs(spamSc)/20))) + '⚪'.repeat(5 - Math.min(5, Math.ceil(Math.abs(spamSc)/20)));
            out += `⚠️ *SPAM ALERT!*\n${bar} (${Math.abs(spamSc)} pts)\n` + (spamType ? `🔴 *Type:* ${spamType}\n` : '');
          } else {
            out += `✅ *Spam:* Clean\n`;
          }
          out += `\n━━━━━━━━━━━━━━━━━━━━━\n_Source: Truecaller_` + FOOTER;

          const ppUrl = await sock.profilePictureUrl(norm + '@s.whatsapp.net', 'image').catch(() => null);
          if (ppUrl) {
            const { getBuffer } = await import('../../lib/helper.js');
            const imgBuf = await getBuffer(ppUrl).catch(() => null);
            if (imgBuf) {
              await sock.sendMessage(jid, { image: imgBuf, caption: out }, { quoted: msg });
              return await react('✅');
            }
          }
          await reply(out);
          return await react('✅');
        }
      } catch (err) {
        // installationId expired? fall through to RapidAPI or WA-native
      }
    }

    // ── Priority 2: RapidAPI Truecaller (if valid paid key) ──────────────────
    if (hasValidKey()) {
      try {
        const phoneParam = norm.slice(ccLen);
        const apiRes = await tcLookup(phoneParam, countryCode);

        if (apiRes?.status && apiRes?.data?.length) {
          const r       = apiRes.data[0];
          const name    = r.name || 'Unknown';
          const ph      = r.phones?.[0] || {};
          const carrier = ph.carrier || pkOperator || '';
          const numType = ph.numberType || 'MOBILE';
          const addr    = r.addresses?.[0] || {};
          const city    = (addr.address && addr.address !== countryCode) ? addr.address : '';
          const country = addr.countryCode || countryCode;
          const email   = (r.internetAddresses || [])[0]?.id || '';
          const badges  = (r.badges || []).join(', ');
          const spamSc  = r.spamScore?.spamScore ?? ph.spamScore ?? 0;
          const spamType= r.spamScore?.spamType  || ph.spamType  || '';
          const isSpam  = spamSc < -10;
          const score   = parseFloat(r.score || 0).toFixed(2);

          let out =
            `🌍 *SIM Owner Info*  _(Truecaller)_\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📱 *Number:*   ${e164}\n` +
            `🌐 *Country:*  ${country}\n` +
            `👤 *Name:*     *${name}*\n`;

          if (carrier || pkOperator) out += `${opColor} *Operator:* ${carrier || pkOperator}\n`;
          if (numType)               out += `📋 *Type:*     ${numType}\n`;
          if (city)                  out += `📍 *City:*     ${city}\n`;
          if (email)                 out += `📧 *Email:*    ${email}\n`;
          if (badges)                out += `🏅 *Badges:*   ${badges}\n`;
          out += `⭐ *Score:*    ${score}/1.0\n\n`;

          if (isSpam) {
            const bar = '🔴'.repeat(Math.min(5, Math.ceil(Math.abs(spamSc) / 20))) + '⚪'.repeat(5 - Math.min(5, Math.ceil(Math.abs(spamSc) / 20)));
            out += `⚠️ *SPAM ALERT!*\n${bar} (${Math.abs(spamSc)} pts)\n` + (spamType ? `🔴 *Type:* ${spamType}\n` : '');
          } else {
            out += `✅ *Spam:* Clean\n`;
          }

          out += `\n━━━━━━━━━━━━━━━━━━━━━\n_Source: Truecaller crowdsourced DB_` + FOOTER;

          // Send with WA profile pic if available
          const ppUrl = await sock.profilePictureUrl(norm + '@s.whatsapp.net', 'image').catch(() => null);
          if (ppUrl) {
            const { getBuffer } = await import('../../lib/helper.js');
            const imgBuf = await getBuffer(ppUrl).catch(() => null);
            if (imgBuf) {
              await sock.sendMessage(jid, { image: imgBuf, caption: out }, { quoted: msg });
              return await react('✅');
            }
          }
          await reply(out);
          return await react('✅');
        }
      } catch (err) {
        const st = err?.response?.status;
        // 401/403 = key invalid → fall through to WA-native lookup silently
        // 429 = rate limit → tell the user
        if (st === 429) {
          await react('⚠️');
          return reply(`⚠️ *Truecaller Rate Limit*\n\nRapidAPI daily limit reached. Try again tomorrow.\n\n_Switching to WhatsApp-only info..._` + FOOTER);
        }
        if (st !== 401 && st !== 403) {
          // Unexpected error — fall through to WA-native silently
        }
        // 401/403: fall through to WA-native below (key invalid but don't bother user)
      }
    }

    // ── WhatsApp-native lookup (always works, no API key needed) ─────────────
    try {
      const { isOnWA, pushName, biz, ppLink } = await waLookup(norm, sock);

      let out =
        `📱 *Number Info*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📞 *Number:*   ${e164}\n` +
        `🌐 *Country:*  ${ccName} (${countryCode})\n`;

      if (pkOperator) out += `${opColor} *Operator:* ${pkOperator}\n`;

      out += `\n`;

      if (isOnWA) {
        out += `✅ *WhatsApp:*  Active\n`;
        if (pushName)        out += `👤 *Name:*     *${pushName}*\n`;
        if (biz?.description) out += `🏢 *Business:* Yes\n📝 *About:*    ${biz.description.slice(0, 80)}\n`;
        else if (biz?.isBusiness) out += `🏢 *Business:* Yes\n`;
        if (biz?.email)      out += `📧 *Biz Email:* ${biz.email}\n`;
        if (biz?.website?.length) out += `🌐 *Website:*  ${biz.website[0]}\n`;
        if (biz?.category)   out += `🏷️ *Category:* ${biz.category}\n`;
      } else {
        out += `❌ *WhatsApp:*  Not registered\n`;
      }

      out +=
        `\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `_💡 For name lookup: set_ \`RAPIDAPI_TRUECALLER_KEY\` _in .env_` +
        FOOTER;

      // Send with profile pic if on WA and pic available
      if (isOnWA && ppLink) {
        try {
          const { getBuffer } = await import('../../lib/helper.js');
          const imgBuf = await getBuffer(ppLink).catch(() => null);
          if (imgBuf) {
            await sock.sendMessage(jid, { image: imgBuf, caption: out }, { quoted: msg });
            return await react('✅');
          }
        } catch {}
      }

      await reply(out);
      await react('✅');

    } catch (err) {
      await react('❌');
      await reply(`❌ *Lookup Failed*\n\n_${String(err.message).slice(0, 200)}_` + FOOTER);
    }
  },
};
