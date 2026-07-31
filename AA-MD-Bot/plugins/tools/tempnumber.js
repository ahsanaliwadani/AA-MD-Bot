// AA MD Bot — Temporary Phone Number
// Source: DavidCyrilTech API (confirmed working)
// Commands:
//   .tempnumber          → list available numbers
//   .tempnumber <slug>   → show SMS inbox for that number (e.g. 46731299509-Sweden)
import axios from 'axios';

const DC  = 'https://apis.davidcyriltech.my.id/tempnumber/receive-sms-online';
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Fetch list of available numbers ──────────────────────────────────────────
// Actual response shape:
// { creator, success, source, result: { numbers: [ { number, country, slug, url }, ... ] } }
async function fetchNumbers() {
  const { data } = await axios.get(`${DC}/numbers`, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });

  if (data?.success === false) throw new Error(data?.message || 'API returned success:false');

  const list = data?.result?.numbers || data?.numbers || data?.data || (Array.isArray(data) ? data : []);
  if (!list.length) throw new Error('No numbers returned by API');
  return list;
}

// ── Fetch SMS inbox for a specific number ────────────────────────────────────
// number param format: "46731299509-Sweden" (the "slug" field from the numbers endpoint)
async function fetchInbox(numberParam) {
  const { data } = await axios.get(`${DC}/inbox`, {
    params: { number: numberParam },
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });

  if (data?.success === false) throw new Error(data?.message || 'API returned success:false');

  // Normalise to an array of message objects/strings — handle nested result too
  const raw =
    data?.result?.messages || data?.result?.sms || data?.result?.inbox ||
    data?.messages || data?.sms || data?.inbox || data?.data ||
    (Array.isArray(data) ? data : []) ||
    (Array.isArray(data?.result) ? data.result : []);

  return raw.map(m => {
    if (typeof m === 'string') return m;
    const sender  = m.sender  || m.from    || m.number      || '';
    const content = m.message || m.content || m.text        || m.body || '';
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

    // If argument looks like a slug/number param (digits, may include -Country suffix)
    // e.g. "+46731299509", "46731299509", "46731299509-Sweden"
    const isNumberInput = /^[\+\d][\d\-A-Za-z]{5,}$/.test(input) && input.toLowerCase() !== 'list';

    if (isNumberInput) {
      await react('📲');
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

      // Group by country
      const groups = {};
      for (const n of numbers) {
        const country = n.country || n.Country || '🌍 Other';
        const slug     = n.slug || `${(n.number || '').toString().replace(/^\+/, '')}-${country}`;
        if (!groups[country]) groups[country] = [];
        groups[country].push({ display: n.number || slug, slug });
      }

      for (const [country, nums] of Object.entries(groups)) {
        out += `*${country}*\n`;
        nums.slice(0, 10).forEach(n => { out += `  • \`${n.slug}\`\n`; });
        out += '\n';
      }

      // Example usage from the first number
      const first = numbers[0];
      const exParam = first.slug || `${(first.number || '').toString().replace(/^\+/, '')}-${first.country || ''}`;

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
