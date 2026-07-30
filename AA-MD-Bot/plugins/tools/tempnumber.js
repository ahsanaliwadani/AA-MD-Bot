// AA MD Bot — Temporary Phone Number
// Source: DavidCyrilTech API (confirmed working)
// Commands:
//   .tempnumber          → list available numbers
//   .tempnumber <number-Country> → show SMS inbox for that number
//   .tempnumber list     → same as bare command
import axios from 'axios';

const DC  = 'https://apis.davidcyriltech.my.id/tempnumber/receive-sms-online';
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Fetch list of available numbers ──────────────────────────────────────────
// Response: array of { number, country, flag? } or similar
async function fetchNumbers() {
  const { data } = await axios.get(`${DC}/numbers`, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });

  // Handle both array and { numbers: [...] } shapes
  const list = Array.isArray(data) ? data : (data?.numbers || data?.data || []);
  if (!list.length) throw new Error('No numbers returned by API');
  return list;
}

// ── Fetch SMS inbox for a specific number ────────────────────────────────────
// number param format:  "46731299509-Sweden"  (as returned by the numbers endpoint)
async function fetchInbox(numberParam) {
  const { data } = await axios.get(`${DC}/inbox`, {
    params: { number: numberParam },
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });

  // Normalise to an array of message strings
  const raw = Array.isArray(data) ? data : (data?.messages || data?.sms || data?.inbox || data?.data || []);
  return raw.map(m => {
    if (typeof m === 'string') return m;
    const sender  = m.sender  || m.from    || m.number  || '';
    const content = m.message || m.content || m.text    || m.body   || '';
    const time    = m.time    || m.date    || m.received_at || '';
    return [sender && `From: ${sender}`, time && `🕐 ${time}`, content]
      .filter(Boolean).join('\n');
  }).filter(Boolean);
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'tempnumber',
  alias: ['tmpnum', 'tmpphone', 'freesms', 'tempsms', 'tempphone', 'virtual-number'],
  description: 'Get a free temporary phone number to receive SMS',
  category: 'tools',

  async execute({ args, text, reply, react, prefix }) {
    const input = (text || '').trim();

    // If argument looks like a number param (digits, may include country suffix)
    // e.g. "+46731299509", "46731299509", "46731299509-Sweden"
    const isNumberInput = /^[\+\d][\d\-A-Za-z]{5,}$/.test(input) && input !== 'list';

    if (isNumberInput) {
      await react('📲');
      // Normalise: strip leading + so it matches the API param format
      const numberParam = input.replace(/^\+/, '');
      try {
        const msgs = await fetchInbox(numberParam);

        if (!msgs.length) {
          await react('✅');
          return reply(
            `📲 *SMS Inbox — ${numberParam}*\n\n` +
            `📭 No messages yet (inbox may be empty).\n\n` +
            `> 📱 *AA MD Bot*`
          );
        }

        let out = `📲 *SMS Inbox — ${numberParam}*\n${'─'.repeat(28)}\n\n`;
        msgs.slice(0, 8).forEach((m, i) => {
          out += `*${i + 1}.* ${m}\n\n`;
        });
        out += `> 📱 *AA MD Bot*`;

        await react('✅');
        return reply(out);
      } catch (e) {
        await react('❌');
        return reply(`❌ *Could not fetch SMS*\n\n${e.message}\n\n> 📱 *AA MD Bot*`);
      }
    }

    // Default: list available numbers
    await react('📱');
    try {
      const numbers = await fetchNumbers();

      let out =
        `📱 *Temporary Phone Numbers*\n` +
        `📡 Source: DavidCyrilTech\n` +
        `${'─'.repeat(28)}\n\n`;

      // Group by country if country field exists, otherwise flat list
      const hasCountry = numbers[0]?.country || numbers[0]?.Country;

      if (hasCountry) {
        const groups = {};
        for (const n of numbers) {
          const country = n.country || n.Country || '🌍 Other';
          if (!groups[country]) groups[country] = [];
          // Build the inbox param: e.g. "46731299509-Sweden"
          const numStr = (n.number || n.phone || n.phoneNumber || '').toString().replace(/^\+/, '');
          const param  = `${numStr}-${country}`;
          groups[country].push(param);
        }
        for (const [country, nums] of Object.entries(groups)) {
          out += `*${country}*\n`;
          nums.forEach(p => { out += `  • \`${p}\`\n`; });
          out += '\n';
        }
      } else {
        numbers.slice(0, 20).forEach(n => {
          const raw = n.number || n.phone || n.phoneNumber || JSON.stringify(n);
          out += `  • \`${raw}\`\n`;
        });
        out += '\n';
      }

      // Example: pick the first number to show usage
      const firstRaw = numbers[0];
      const firstNum = (firstRaw?.number || firstRaw?.phone || firstRaw?.phoneNumber || '').toString().replace(/^\+/, '');
      const firstCountry = firstRaw?.country || firstRaw?.Country || '';
      const exParam = firstCountry ? `${firstNum}-${firstCountry}` : firstNum;

      out +=
        `💡 *To read SMS:*\n` +
        `${prefix}tempnumber ${exParam}\n\n` +
        `⚠️ _These are public numbers — do NOT use for personal verification._\n\n` +
        `> 📱 *AA MD Bot*`;

      await react('✅');
      return reply(out);
    } catch (e) {
      await react('❌');
      return reply(`❌ *Temp Number Failed*\n\n${e.message}\n\nTry again later.\n\n> 📱 *AA MD Bot*`);
    }
  },
};
