// AA MD Bot — Temporary Phone Number
// Source: sms-receive.net (public free numbers, no auth needed)
// Commands:
//   .tempnumber          → list available numbers by country
//   .tempnumber <number> → show latest SMS for that number
//   .tempnumber list     → same as bare command
import axios from 'axios';

const BASE = 'https://sms-receive.net';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ── Scrape number list from homepage ─────────────────────────────────────────
async function fetchNumbers() {
  const { data: html } = await axios.get(BASE + '/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    timeout: 15000,
  });

  // Numbers are in: <div class="text-lg font-black text-gray-900 ...">+447848446595</div>
  const re = /class="text-lg font-black text-gray-900[^"]*"[^>]*>\s*(\+[\d\s\-]{8,20})\s*<\/div>/g;
  const nums = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = m[1].replace(/\s/g, '').trim();
    if (n.startsWith('+')) nums.add(n);
  }

  // Fallback: any +E.164 style number in the HTML
  if (nums.size === 0) {
    const fallback = html.match(/\+[1-9][0-9]{7,14}/g) || [];
    fallback.slice(0, 20).forEach(n => nums.add(n));
  }

  if (nums.size === 0) throw new Error('Could not parse numbers from site');
  return [...nums];
}

// ── Group numbers by country code ─────────────────────────────────────────────
const COUNTRY_MAP = {
  '+1':   '🇺🇸 USA/Canada',
  '+44':  '🇬🇧 UK',
  '+49':  '🇩🇪 Germany',
  '+33':  '🇫🇷 France',
  '+46':  '🇸🇪 Sweden',
  '+47':  '🇳🇴 Norway',
  '+45':  '🇩🇰 Denmark',
  '+358': '🇫🇮 Finland',
  '+31':  '🇳🇱 Netherlands',
  '+48':  '🇵🇱 Poland',
  '+41':  '🇨🇭 Switzerland',
  '+43':  '🇦🇹 Austria',
  '+32':  '🇧🇪 Belgium',
  '+61':  '🇦🇺 Australia',
  '+64':  '🇳🇿 New Zealand',
  '+81':  '🇯🇵 Japan',
  '+82':  '🇰🇷 South Korea',
  '+86':  '🇨🇳 China',
  '+91':  '🇮🇳 India',
  '+92':  '🇵🇰 Pakistan',
  '+55':  '🇧🇷 Brazil',
  '+52':  '🇲🇽 Mexico',
  '+7':   '🇷🇺 Russia',
};

function getCountryLabel(number) {
  // Try longest prefix first
  const sorted = Object.keys(COUNTRY_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (number.startsWith(prefix)) return COUNTRY_MAP[prefix];
  }
  return '🌍 International';
}

function groupByCountry(numbers) {
  const groups = {};
  for (const n of numbers) {
    const label = getCountryLabel(n);
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return groups;
}

// ── Scrape SMS list for a specific number ─────────────────────────────────────
async function fetchSms(number) {
  // Strip + for URL
  const urlNum = number.startsWith('+') ? number.slice(1) : number;
  const { data: html } = await axios.get(`${BASE}/${urlNum}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    timeout: 15000,
  });

  const messages = [];

  // Try to find SMS content blocks (various possible class patterns)
  // Pattern 1: Look for sender + message pairs in the page
  const blocks = html.match(/<div[^>]*class="[^"]*(?:message|sms|inbox|msg)[^"]*"[^>]*>([\s\S]{5,500}?)<\/div>/gi) || [];
  for (const block of blocks.slice(0, 10)) {
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 5 && text.length < 400) messages.push(text);
  }

  // Pattern 2: Look for table rows with text content
  if (messages.length === 0) {
    const trows = html.match(/<tr[^>]*>([\s\S]{10,500}?)<\/tr>/gi) || [];
    for (const row of trows.slice(0, 15)) {
      const cells = (row.match(/<td[^>]*>([\s\S]{2,200}?)<\/td>/gi) || [])
        .map(c => c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(c => c.length > 2);
      if (cells.length >= 2) messages.push(cells.join(' | '));
    }
  }

  // Pattern 3: Generic paragraph/div text extraction 
  if (messages.length === 0) {
    const paras = html.match(/<p[^>]*>([\s\S]{10,300}?)<\/p>/gi) || [];
    for (const p of paras.slice(0, 10)) {
      const text = p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 10 && !/copyright|privacy|terms|cookie/i.test(text)) messages.push(text);
    }
  }

  return messages.slice(0, 8);
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default {
  command: 'tempnumber',
  alias: ['tmpnum', 'tmpphone', 'freesms', 'tempsms', 'tempphone', 'virtual-number'],
  description: 'Get a free temporary phone number to receive SMS',
  category: 'tools',

  async execute({ args, text, reply, react, prefix }) {
    const input = (text || '').trim();

    // If argument looks like a phone number → show SMS
    const isNumber = /^\+?[0-9]{7,15}$/.test(input.replace(/[\s\-]/g, ''));
    if (isNumber || input.toLowerCase().startsWith('+')) {
      await react('📲');
      try {
        const num = input.startsWith('+') ? input : '+' + input;
        const smsList = await fetchSms(num);

        if (!smsList.length) {
          await react('✅');
          return reply(
            `📲 *SMS Inbox — ${num}*\n\n` +
            `📭 No messages found (inbox may be empty).\n\n` +
            `🔗 Check live: ${BASE}/${num.replace('+', '')}\n\n` +
            `> 📱 *AA MD Bot*`
          );
        }

        let text_ = `📲 *SMS Inbox — ${num}*\n${'─'.repeat(28)}\n\n`;
        smsList.forEach((msg, i) => {
          text_ += `*${i + 1}.* ${msg}\n\n`;
        });
        text_ += `🔗 Live: ${BASE}/${num.replace('+', '')}\n\n> 📱 *AA MD Bot*`;

        await react('✅');
        return reply(text_);
      } catch (e) {
        await react('❌');
        return reply(`❌ *Could not fetch SMS*\n\n${e.message}\n\n> 📱 *AA MD Bot*`);
      }
    }

    // Default: list available numbers
    await react('📱');
    try {
      const numbers = await fetchNumbers();
      const groups  = groupByCountry(numbers);

      let text_ =
        `📱 *Temporary Phone Numbers*\n` +
        `📡 Source: sms-receive.net\n` +
        `${'─'.repeat(28)}\n\n`;

      for (const [country, nums] of Object.entries(groups)) {
        text_ += `${country}\n`;
        nums.forEach(n => { text_ += `  • \`${n}\`\n`; });
        text_ += '\n';
      }

      text_ +=
        `💡 *To read SMS:*\n` +
        `${prefix}tempnumber +447848446595\n\n` +
        `⚠️ _These are public numbers — do NOT use for personal verification._\n\n` +
        `> 📱 *AA MD Bot*`;

      await react('✅');
      return reply(text_);
    } catch (e) {
      await react('❌');
      return reply(`❌ *Temp Number Failed*\n\n${e.message}\n\nTry again later.\n\n> 📱 *AA MD Bot*`);
    }
  },
};
