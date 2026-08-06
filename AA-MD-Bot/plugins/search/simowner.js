// ============================================================
// AA MD Bot — SIM / Number Lookup  (.simowner)
// Developer: Ahsan Ali | AA Mods
//
// Sources (no API key, no login required):
//  1. WhatsApp-native  — push name, profile pic, business info
//  2. Prefix-based     — carrier detection (PK, IN, AE, SA, BD, UK, US, MY, TR)
//  3. Country + region — from dialling code prefix
// ============================================================

import axios from 'axios';
import config from '../../config.js';

const FOOTER = '\n\n> 🌍 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// ── Country code → ISO ────────────────────────────────────────
const CC_MAP = {
  '1':'US','7':'RU','20':'EG','27':'ZA','31':'NL','32':'BE','33':'FR',
  '34':'ES','39':'IT','40':'RO','44':'GB','46':'SE','47':'NO','48':'PL',
  '49':'DE','51':'PE','52':'MX','54':'AR','55':'BR','57':'CO','58':'VE',
  '60':'MY','62':'ID','63':'PH','64':'NZ','65':'SG','66':'TH','81':'JP',
  '82':'KR','84':'VN','86':'CN','90':'TR','91':'IN','92':'PK','93':'AF',
  '94':'LK','95':'MM','98':'IR','212':'MA','213':'DZ','216':'TN','218':'LY',
  '233':'GH','234':'NG','254':'KE','255':'TZ','256':'UG','260':'ZM','263':'ZW',
  '351':'PT','352':'LU','353':'IE','354':'IS','355':'AL','358':'FI','359':'BG',
  '370':'LT','371':'LV','372':'EE','374':'AM','375':'BY','380':'UA','381':'RS',
  '385':'HR','386':'SI','420':'CZ','421':'SK','501':'BZ','502':'GT','503':'SV',
  '504':'HN','505':'NI','506':'CR','507':'PA','509':'HT','591':'BO','593':'EC',
  '595':'PY','598':'UY','670':'TL','673':'BN','675':'PG','680':'PW','686':'KI',
  '852':'HK','853':'MO','855':'KH','856':'LA','880':'BD','886':'TW','960':'MV',
  '961':'LB','962':'JO','963':'SY','964':'IQ','965':'KW','966':'SA','967':'YE',
  '968':'OM','970':'PS','971':'AE','972':'IL','973':'BH','974':'QA','975':'BT',
  '976':'MN','977':'NP','992':'TJ','993':'TM','994':'AZ','995':'GE','996':'KG',
  '998':'UZ',
};

const CC_NAMES = {
  'US':'United States 🇺🇸','GB':'United Kingdom 🇬🇧','PK':'Pakistan 🇵🇰',
  'IN':'India 🇮🇳','SA':'Saudi Arabia 🇸🇦','AE':'UAE 🇦🇪',
  'MY':'Malaysia 🇲🇾','ID':'Indonesia 🇮🇩','TR':'Turkey 🇹🇷',
  'EG':'Egypt 🇪🇬','NG':'Nigeria 🇳🇬','BD':'Bangladesh 🇧🇩',
  'PH':'Philippines 🇵🇭','KW':'Kuwait 🇰🇼','QA':'Qatar 🇶🇦',
  'BH':'Bahrain 🇧🇭','OM':'Oman 🇴🇲','JO':'Jordan 🇯🇴',
  'IQ':'Iraq 🇮🇶','LB':'Lebanon 🇱🇧','SY':'Syria 🇸🇾',
  'AF':'Afghanistan 🇦🇫','IR':'Iran 🇮🇷','LK':'Sri Lanka 🇱🇰',
  'MM':'Myanmar 🇲🇲','NP':'Nepal 🇳🇵','KH':'Cambodia 🇰🇭',
  'VN':'Vietnam 🇻🇳','TH':'Thailand 🇹🇭','SG':'Singapore 🇸🇬',
  'CN':'China 🇨🇳','JP':'Japan 🇯🇵','KR':'South Korea 🇰🇷',
  'RU':'Russia 🇷🇺','DE':'Germany 🇩🇪','FR':'France 🇫🇷',
  'IT':'Italy 🇮🇹','ES':'Spain 🇪🇸','BR':'Brazil 🇧🇷',
  'MX':'Mexico 🇲🇽','AR':'Argentina 🇦🇷','ZA':'South Africa 🇿🇦',
  'KE':'Kenya 🇰🇪','GH':'Ghana 🇬🇭','MA':'Morocco 🇲🇦',
  'DZ':'Algeria 🇩🇿','TN':'Tunisia 🇹🇳','HK':'Hong Kong 🇭🇰',
};

// ── Carrier databases ─────────────────────────────────────────

// Pakistan — by 03xx prefix
const PK_OPS = {
  '0300':'Jazz','0301':'Jazz','0302':'Jazz','0303':'Jazz','0304':'Jazz','0305':'Jazz',
  '0306':'Jazz','0307':'Jazz','0308':'Jazz','0309':'Jazz',
  '0310':'Zong','0311':'Zong','0312':'Zong','0313':'Zong','0314':'Zong',
  '0315':'Zong','0316':'Zong','0317':'Zong','0318':'Zong','0319':'Zong',
  '0320':'Jazz (Warid)','0321':'Jazz (Warid)','0322':'Jazz (Warid)',
  '0323':'Jazz (Warid)','0324':'Jazz (Warid)','0325':'Jazz (Warid)',
  '0326':'Jazz (Warid)','0327':'Jazz (Warid)','0328':'Jazz (Warid)','0329':'Jazz (Warid)',
  '0330':'Ufone','0331':'Ufone','0332':'Ufone','0333':'Ufone','0334':'Ufone',
  '0335':'Ufone','0336':'Ufone','0337':'Ufone','0338':'Ufone','0339':'Ufone',
  '0340':'Telenor','0341':'Telenor','0342':'Telenor','0343':'Telenor',
  '0344':'Telenor','0345':'Telenor','0346':'Telenor','0347':'Telenor',
  '0348':'Telenor','0349':'Telenor',
  '0450':'SCO (SCOM)','0451':'SCO (SCOM)',
};
const PK_OP_ICONS = {
  'Jazz':'🟠','Jazz (Warid)':'🟠','Zong':'🔵','Ufone':'🟢','Telenor':'🔴','SCO (SCOM)':'🟣',
};

// India — by series prefix (after country code 91)
const IN_OPS = {
  '70':'Jio','71':'Jio','72':'Jio','73':'Jio','74':'Jio','75':'Jio',
  '76':'Jio','77':'Jio','78':'Jio','79':'Jio',
  '80':'Airtel','81':'Airtel','82':'Airtel','83':'Airtel','84':'Airtel',
  '85':'Vodafone/Vi','86':'Vodafone/Vi','87':'Vodafone/Vi','88':'Vodafone/Vi',
  '89':'Airtel','90':'Airtel','91':'Airtel','92':'Airtel',
  '93':'BSNL','94':'BSNL','95':'BSNL','96':'Jio',
  '97':'Jio','98':'BSNL','99':'Idea/Vi',
};

// UAE — by 05x series
const AE_OPS = {
  '050':'Etisalat (du)','051':'Etisalat','052':'Etisalat','054':'du',
  '055':'Etisalat','056':'du','058':'Etisalat',
};

// Saudi Arabia — by 05x series
const SA_OPS = {
  '050':'STC','053':'Mobily','054':'Zain','055':'STC',
  '056':'Mobily','057':'Zain','058':'STC','059':'Virgin Mobile',
};

// Bangladesh — by 01x series (after 880)
const BD_OPS = {
  '011':'Teletalk','013':'Robi','014':'Banglalink','015':'Teletalk',
  '016':'Airtel','017':'Grameenphone','018':'Robi','019':'Banglalink',
};

// UK — OFCOM ranges
const GB_OPS = {
  '7911':'EE','7951':'EE','7919':'EE','7900':'Vodafone','7901':'Vodafone',
  '7950':'O2','7973':'O2','7990':'Three','7500':'Three',
};

// Malaysia — by 01x series
const MY_OPS = {
  '011':'Celcom','012':'Maxis','013':'Celcom','014':'U Mobile',
  '016':'Digi','017':'Maxis','018':'Digi','019':'Maxis',
};

// Turkey — by 05x series
const TR_OPS = {
  '0500':'Turkcell','0505':'Vodafone','0507':'Turkcell',
  '0530':'Turkcell','0533':'Turkcell','0536':'Vodafone',
  '0537':'Turkcell','0542':'Turkcell','0543':'Vodafone',
  '0544':'Vodafone','0546':'Vodafone','0551':'Turk Telekom',
  '0552':'Turk Telekom','0553':'Turk Telekom','0554':'Vodafone',
  '0555':'Vodafone','0556':'Vodafone','0561':'Turkcell',
};

// ── Helper: normalise raw input ───────────────────────────────
function normalise(raw) {
  let n = raw.replace(/[\s\-.()+]/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0') && n.length <= 11) n = n.slice(1);
  return n;
}

// ── Helper: detect country from number ───────────────────────
function detectCountry(norm) {
  for (const len of [3, 2, 1]) {
    const prefix = norm.slice(0, len);
    if (CC_MAP[prefix]) return { cc: CC_MAP[prefix], ccLen: len };
  }
  return { cc: 'US', ccLen: 1 };
}

// ── Helper: detect carrier ────────────────────────────────────
function detectCarrier(norm, cc) {
  const local = norm; // norm = digits without leading zeros/+

  if (cc === 'PK') {
    // norm starts with 92, convert to 03xx
    if (!local.startsWith('92')) return null;
    const localNum = '0' + local.slice(2);
    const prefix4 = localNum.slice(0, 4);
    const op = PK_OPS[prefix4] || null;
    return op ? { name: op, icon: PK_OP_ICONS[op] || '📱' } : null;
  }

  if (cc === 'IN') {
    // norm starts with 91, local series = 3rd-4th digit pair
    if (!local.startsWith('91')) return null;
    const series = local.slice(2, 4);
    const op = IN_OPS[series] || null;
    return op ? { name: op, icon: '📱' } : null;
  }

  if (cc === 'AE') {
    if (!local.startsWith('971')) return null;
    const suf = '0' + local.slice(3);
    for (const [k, v] of Object.entries(AE_OPS)) {
      if (suf.startsWith(k)) return { name: v, icon: '📱' };
    }
    return null;
  }

  if (cc === 'SA') {
    if (!local.startsWith('966')) return null;
    const suf = '0' + local.slice(3);
    for (const [k, v] of Object.entries(SA_OPS)) {
      if (suf.startsWith(k)) return { name: v, icon: '📱' };
    }
    return null;
  }

  if (cc === 'BD') {
    if (!local.startsWith('880')) return null;
    const suf = local.slice(3, 6);
    const op = BD_OPS[suf] || null;
    return op ? { name: op, icon: '📱' } : null;
  }

  if (cc === 'MY') {
    if (!local.startsWith('60')) return null;
    const suf = local.slice(2, 5);
    const op = MY_OPS[suf] || null;
    return op ? { name: op, icon: '📱' } : null;
  }

  if (cc === 'TR') {
    if (!local.startsWith('90')) return null;
    const suf = '0' + local.slice(2);
    for (const [k, v] of Object.entries(TR_OPS)) {
      if (suf.startsWith(k)) return { name: v, icon: '📱' };
    }
    return null;
  }

  if (cc === 'GB') {
    if (!local.startsWith('44')) return null;
    const suf = local.slice(2, 6);
    for (const [k, v] of Object.entries(GB_OPS)) {
      if (suf.startsWith(k)) return { name: v, icon: '📱' };
    }
    return null;
  }

  if (cc === 'US') {
    return { name: 'US Carrier', icon: '📱' };
  }

  return null;
}

// ── Helper: WhatsApp-native lookup ────────────────────────────
async function waLookup(norm, sock) {
  const jid = norm + '@s.whatsapp.net';
  const [waCheck, bizProfile, ppUrl] = await Promise.allSettled([
    sock.onWhatsApp(norm).catch(() => null),
    sock.getBusinessProfile(jid).catch(() => null),
    sock.profilePictureUrl(jid, 'image').catch(() => null),
  ]);

  const waInfo  = waCheck.status    === 'fulfilled' ? waCheck.value    : null;
  const biz     = bizProfile.status === 'fulfilled' ? bizProfile.value : null;
  const ppLink  = ppUrl.status      === 'fulfilled' ? ppUrl.value      : null;

  const onWAEntry = Array.isArray(waInfo) ? waInfo.find(w => w?.jid?.includes(norm)) : null;
  const isOnWA   = !!onWAEntry?.exists;
  const pushName = onWAEntry?.notify || biz?.name || null;

  return { isOnWA, pushName, biz, ppLink };
}

// ── Main plugin ───────────────────────────────────────────────
export default {
  command:     'simowner',
  alias:       ['callerid', 'simname', 'siminfo', 'tcall', 'ownersim', 'pkowner', 'numlookup', 'phoneinfo'],
  description: 'SIM / phone number lookup — carrier, country, WhatsApp info (no API key needed)',
  category:    'search',
  ownerOnly:   true,
  usage:       '.simowner <number>',

  async execute({ text, reply, react, prefix, sock, jid: chatJid, msg }) {
    const input = (text || '').trim();

    if (!input) {
      return reply(
        `📱 *SIM / Number Lookup*\n\n` +
        `*Usage:* ${prefix}simowner <number>\n\n` +
        `*Formats:*\n` +
        `▸ \`+923001234567\` — Pakistan (with +)\n` +
        `▸ \`923001234567\`  — Pakistan (with CC)\n` +
        `▸ \`03001234567\`   — Pakistan local\n` +
        `▸ \`+917001234567\` — India\n` +
        `▸ \`+971501234567\` — UAE\n` +
        `▸ \`+966501234567\` — Saudi Arabia\n` +
        `▸ \`+447911123456\` — UK\n\n` +
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
        `_"${input}"_ doesn't look like a valid phone number.\n\n` +
        `Include country code:\n` +
        `▸ \`+923001234567\` (Pakistan)\n` +
        `▸ \`+917001234567\` (India)\n` +
        `▸ \`+971501234567\` (UAE)` + FOOTER
      );
    }

    const { cc, ccLen } = detectCountry(norm);
    const e164    = '+' + norm;
    const ccName  = CC_NAMES[cc] || cc;
    const carrier = detectCarrier(norm, cc);

    // ── WhatsApp native lookup ────────────────────────────────
    try {
      const { isOnWA, pushName, biz, ppLink } = await waLookup(norm, sock);

      // ── Build result message ──────────────────────────────
      let out =
        `📱 *Number Lookup Result*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📞 *Number:*  ${e164}\n` +
        `🌐 *Country:* ${ccName}\n`;

      // Carrier
      if (carrier) {
        out += `${carrier.icon} *Carrier:* ${carrier.name}\n`;
      }

      // WhatsApp status
      out += `\n`;
      if (isOnWA) {
        out += `✅ *WhatsApp:* Active\n`;
        if (pushName) {
          out += `👤 *Name:* *${pushName}*\n`;
        } else {
          out += `👤 *Name:* Hidden (no push name)\n`;
        }
        if (biz?.isBusiness || biz?.description || biz?.name) {
          out += `\n🏢 *Business Account:* Yes\n`;
          if (biz.description) out += `📝 *About:* ${biz.description.slice(0, 120)}\n`;
          if (biz.email)       out += `📧 *Email:* ${biz.email}\n`;
          if (biz.website?.length) out += `🌐 *Website:* ${biz.website[0]}\n`;
          if (biz.category)    out += `🏷️ *Category:* ${biz.category}\n`;
          if (biz.address)     out += `📍 *Address:* ${biz.address}\n`;
        }
      } else {
        out += `❌ *WhatsApp:* Not registered\n`;
      }

      out += `\n━━━━━━━━━━━━━━━━━━━━━` + FOOTER;

      // ── Send with profile pic if available ────────────────
      if (isOnWA && ppLink) {
        try {
          const { getBuffer } = await import('../../lib/helper.js');
          const imgBuf = await getBuffer(ppLink).catch(() => null);
          if (imgBuf) {
            await sock.sendMessage(chatJid, { image: imgBuf, caption: out }, { quoted: msg });
            return await react('✅');
          }
        } catch {}
      }

      await reply(out);
      return await react('✅');

    } catch (err) {
      await react('❌');
      return reply(`❌ *Lookup Failed*\n\n_${String(err.message).slice(0, 200)}_` + FOOTER);
    }
  },
};
