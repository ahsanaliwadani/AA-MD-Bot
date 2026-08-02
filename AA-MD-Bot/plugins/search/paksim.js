// ============================================
// AA MD Bot — Pakistan SIM Info 🇵🇰
// Developer: Ahsan Ali | AA Mods
//
// Source 1: Local PTA-based prefix database (instant, no API)
// Source 2: veriphone.io free API (extra details — no key needed)
// Commands: .paksim .siminfo .simcheck .whosim
// ============================================

import axios from 'axios';

const FOOTER = '\n\n> 🇵🇰 *AA MD Bot* • 👨‍💻 *Ahsan Ali Wadani*';

// ── Pakistan operator prefix database (PTA-official series) ─────────────────
// Key = first 4 digits of local number (03XX)
const PREFIX_DB = {
  // ── Jazz / Mobilink (largest network, GSM 900/1800, 4G LTE) ──────────────
  '0300': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0301': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0302': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0303': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0304': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0305': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0306': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0307': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0308': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0309': { operator: 'Jazz (Mobilink)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },

  // ── Zong / CMPAK (China Mobile Pakistan, 4G LTE) ──────────────────────────
  '0310': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0311': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0312': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0313': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0314': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0315': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0316': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0317': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0318': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },
  '0319': { operator: 'Zong (China Mobile)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔵' },

  // ── Jazz / Warid (Warid merged into Jazz 2016, 4G LTE) ────────────────────
  '0320': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0321': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0322': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0323': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0324': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0325': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0326': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0327': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0328': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },
  '0329': { operator: 'Jazz (Warid)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟠' },

  // ── Ufone / PTCL (GSM 900/1800, 4G LTE) ──────────────────────────────────
  '0330': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0331': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0332': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0333': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0334': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0335': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0336': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0337': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0338': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },
  '0339': { operator: 'Ufone (PTCL)', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🟢' },

  // ── Telenor Pakistan (GSM 900/1800, 4G LTE) ───────────────────────────────
  '0340': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0341': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0342': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0343': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0344': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0345': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0346': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0347': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0348': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },
  '0349': { operator: 'Telenor Pakistan', tech: '4G LTE', type: 'Prepaid/Postpaid', color: '🔴' },

  // ── SCO — Special Communication Org (GB & AJK only) ──────────────────────
  '0455': { operator: 'SCO (SCOM)',        tech: '3G/4G', type: 'Prepaid/Postpaid', color: '🟣' },
  '0456': { operator: 'SCO (SCOM)',        tech: '3G/4G', type: 'Prepaid/Postpaid', color: '🟣' },
  '0457': { operator: 'SCO (SCOM)',        tech: '3G/4G', type: 'Prepaid/Postpaid', color: '🟣' },
  '0458': { operator: 'SCO (SCOM)',        tech: '3G/4G', type: 'Prepaid/Postpaid', color: '🟣' },
};

// ── Operator logos / extra info ─────────────────────────────────────────────
const OPERATOR_META = {
  'Jazz (Mobilink)':    { hq: 'Islamabad', founded: '1994', parent: 'VEON Ltd',         website: 'jazz.com.pk',     helpline: '111' },
  'Jazz (Warid)':       { hq: 'Islamabad', founded: '1994', parent: 'VEON Ltd',         website: 'jazz.com.pk',     helpline: '111' },
  'Zong (China Mobile)':{ hq: 'Islamabad', founded: '2008', parent: 'China Mobile Ltd', website: 'zong.com.pk',     helpline: '310' },
  'Ufone (PTCL)':       { hq: 'Islamabad', founded: '2001', parent: 'PTCL / Etisalat',  website: 'ufone.com',       helpline: '333' },
  'Telenor Pakistan':   { hq: 'Islamabad', founded: '2005', parent: 'Telenor Group',    website: 'telenor.com.pk',  helpline: '345' },
  'SCO (SCOM)':         { hq: 'Gilgit',   founded: '1976', parent: 'Govt of Pakistan',  website: 'sco.com.pk',      helpline: '1236' },
};

// ── Normalise a raw number into 03XX-XXXXXXX form ───────────────────────────
function normalise(raw) {
  // Strip spaces, dashes, dots
  let n = raw.replace(/[\s\-.()+]/g, '');

  // Handle country code: +92 or 0092 or 92
  if (n.startsWith('0092')) n = '0' + n.slice(4);
  else if (n.startsWith('92') && n.length === 12) n = '0' + n.slice(2);
  else if (n.startsWith('+92')) n = '0' + n.slice(3);

  return n; // should now be 11 digits starting with 03
}

function formatDisplay(n) {
  // 03XX-XXXXXXX
  if (n.length === 11) return `${n.slice(0, 4)}-${n.slice(4)}`;
  return n;
}

// ── Lookup prefix in local DB ────────────────────────────────────────────────
function localLookup(normalised) {
  const prefix4 = normalised.slice(0, 4); // e.g. "0300"
  return PREFIX_DB[prefix4] || null;
}

// ── veriphone.io free check ──────────────────────────────────────────────────
async function veriphoneCheck(number) {
  try {
    // Convert to E.164: 03001234567 → +923001234567
    const e164 = '+92' + number.slice(1);
    const { data } = await axios.get('https://api.veriphone.io/v2/verify', {
      params: { phone: e164 },
      timeout: 8000,
    });
    if (data?.status === 'success') return data;
  } catch {}
  return null;
}

export default {
  command:     'paksim',
  alias:       ['siminfo', 'simcheck', 'whosim', 'pknum', 'simdetail'],
  description: 'Pakistan SIM / phone number info (operator, network, series)',
  category:    'search',
  usage:       '.paksim <number>',

  async execute({ text, reply, react, prefix }) {
    if (!text) {
      return reply(
        `🇵🇰 *Pakistan SIM Info*\n\n` +
        `*Usage:* ${prefix}paksim <number>\n\n` +
        `*Supported formats:*\n` +
        `▸ \`03001234567\`\n` +
        `▸ \`0300-1234567\`\n` +
        `▸ \`+923001234567\`\n` +
        `▸ \`923001234567\`\n\n` +
        `*Info shown:* Operator • Network • Series • Helpline\n\n` +
        `*Operators covered:*\n` +
        `🟠 Jazz/Mobilink (030X, 032X)\n` +
        `🔵 Zong/CMPAK (031X)\n` +
        `🟢 Ufone/PTCL (033X)\n` +
        `🔴 Telenor (034X)\n` +
        `🟣 SCO/SCOM (045X)` +
        FOOTER
      );
    }

    await react('🔍');

    const normalised = normalise(text.trim());

    // ── Basic format validation ──────────────────────────────────────────────
    if (!/^0[3][0-9]{9}$|^0455[0-9]{7}$|^0456[0-9]{7}$|^0457[0-9]{7}$|^0458[0-9]{7}$/.test(normalised)) {
      // Broaden: any 11-digit number starting with 0
      if (!/^0\d{10}$/.test(normalised)) {
        await react('❌');
        return reply(
          `❌ *Invalid Number*\n\n` +
          `_"${text.trim()}"_ is not a valid Pakistan mobile number.\n\n` +
          `Pakistan mobile numbers are 11 digits and start with *03*.\n` +
          `Example: \`03001234567\`` +
          FOOTER
        );
      }
    }

    // ── Local prefix lookup ──────────────────────────────────────────────────
    const local = localLookup(normalised);
    const display = formatDisplay(normalised);
    const e164    = '+92' + normalised.slice(1);

    // Run veriphone in background (non-blocking)
    const veriphonePromise = veriphoneCheck(normalised);

    if (!local) {
      // Unknown prefix — still show what we know
      await react('⚠️');
      return reply(
        `🇵🇰 *Pakistan SIM Info*\n\n` +
        `📱 *Number:* ${display}\n` +
        `🌐 *E.164:* ${e164}\n\n` +
        `⚠️ *Operator:* Unknown / Unassigned prefix\n` +
        `_This prefix is not currently assigned by PTA._\n\n` +
        `Prefix checked: \`${normalised.slice(0, 4)}\`` +
        FOOTER
      );
    }

    const meta = OPERATOR_META[local.operator] || {};

    // Await veriphone for extra info (but don't fail if it times out)
    const vp = await veriphonePromise;

    // ── Build result card ────────────────────────────────────────────────────
    let msg =
      `🇵🇰 *Pakistan SIM Info*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📱 *Number:* ${display}\n` +
      `🌐 *E.164:* ${e164}\n` +
      `✅ *Valid:* Yes (PTA registered series)\n\n` +
      `${local.color} *Operator:* ${local.operator}\n` +
      `📡 *Network:* ${local.tech}\n` +
      `💳 *Type:* ${local.type}\n` +
      `🔢 *Series:* ${normalised.slice(0, 4)}-XXXXXXX\n`;

    if (meta.parent)   msg += `🏢 *Parent Co:* ${meta.parent}\n`;
    if (meta.founded)  msg += `📅 *Founded:* ${meta.founded}\n`;
    if (meta.hq)       msg += `📍 *HQ:* ${meta.hq}, Pakistan\n`;
    if (meta.website)  msg += `🌍 *Website:* www.${meta.website}\n`;
    if (meta.helpline) msg += `📞 *Helpline:* ${meta.helpline}\n`;

    // Extra from veriphone if available
    if (vp) {
      msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      if (vp.phone_type)    msg += `📋 *Line Type:* ${vp.phone_type}\n`;
      if (vp.country_name)  msg += `🗺️ *Country:* ${vp.country_name}\n`;
      if (vp.carrier)       msg += `🔍 *Carrier (live):* ${vp.carrier}\n`;
    }

    msg +=
      `\n━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ _Name/address info is private — PTA does not share it publicly._` +
      FOOTER;

    await react('✅');
    await reply(msg);
  },
};
