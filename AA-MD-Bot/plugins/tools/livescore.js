// AA MD Bot — Live Sports Scores
// Uses: DavidCyrilTech /sports/live
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';

// Status emoji
function statusEmoji(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('live') || s.includes('progress') || s.includes('quarter') || s.includes('half')) return '🔴';
  if (s.includes('final') || s.includes('finished') || s.includes('ended')) return '✅';
  if (s.includes('scheduled') || s.includes('upcoming') || s.includes('not started')) return '⏳';
  if (s.includes('halftime') || s.includes('break') || s.includes('pause')) return '⏸️';
  return '📊';
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) +
         ' ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'UTC' }) + ' UTC';
}

function renderGame(g) {
  const home = g.homeTeam;
  const away = g.awayTeam;
  const emoji = statusEmoji(g.status);
  let line = `${emoji} *${away?.shortName || away?.name} vs ${home?.shortName || home?.name}*\n`;
  if (g.status && g.status !== 'Scheduled') {
    line += `   Score: ${away?.score || '0'} — ${home?.score || '0'}`;
    if (g.clock && g.clock !== '0:00') line += ` (${g.clock})`;
    line += '\n';
  } else if (g.date) {
    line += `   📅 ${fmtDate(g.date)}\n`;
  }
  return line;
}

function renderSport(name, emoji, data) {
  if (!data?.count || !data.games?.length) return '';
  const games = data.games.slice(0, 5);
  let out = `\n${emoji} *${name}* (${data.count} game${data.count !== 1 ? 's' : ''})\n`;
  out += '─'.repeat(24) + '\n';
  games.forEach(g => { out += renderGame(g); });
  if (data.count > 5) out += `   _+${data.count - 5} more…_\n`;
  return out;
}

export default {
  command: 'livescore',
  alias: ['scores', 'livescores', 'sports', 'sportnews', 'sportslive'],
  description: 'Live sports scores — NFL, NBA, NHL, MLB, soccer, and more',
  category: 'tools',

  async execute({ reply, react, prefix }) {
    await react('⚽');
    try {
      const { data } = await axios.get(`${DC}/sports/live`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 18000,
      });

      if (!data?.success) throw new Error(data?.error || 'No data returned');

      const sportMap = [
        ['nfl',            '🏈', 'NFL (American Football)'],
        ['nba',            '🏀', 'NBA (Basketball)'],
        ['nhl',            '🏒', 'NHL (Ice Hockey)'],
        ['mlb',            '⚾', 'MLB (Baseball)'],
        ['soccer',         '⚽', 'Soccer / Football'],
        ['mls',            '⚽', 'MLS'],
        ['premierleague',  '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Premier League'],
        ['laliga',         '🇪🇸', 'La Liga'],
        ['bundesliga',     '🇩🇪', 'Bundesliga'],
        ['seriea',         '🇮🇹', 'Serie A'],
        ['cricket',        '🏏', 'Cricket'],
        ['tennis',         '🎾', 'Tennis'],
        ['formula1',       '🏎️', 'Formula 1'],
        ['f1',             '🏎️', 'Formula 1'],
        ['golf',           '⛳', 'Golf'],
        ['ufc',            '🥊', 'UFC / MMA'],
        ['rugby',          '🏉', 'Rugby'],
      ];

      let body = '';
      let found = 0;
      for (const [key, emoji, name] of sportMap) {
        if (data[key]) {
          const block = renderSport(name, emoji, data[key]);
          if (block) { body += block; found++; }
        }
      }

      // Any other keys not in the map
      for (const [key, val] of Object.entries(data)) {
        if (key === 'creator' || key === 'success') continue;
        if (sportMap.some(([k]) => k === key)) continue;
        if (val?.count) {
          body += renderSport(key.toUpperCase(), '🏆', val);
          found++;
        }
      }

      if (!found) {
        return reply(`📊 *Live Scores*\n\nNo live or upcoming games right now. Check back later!\n\n> 🤖 *AA MD Bot*`);
      }

      const header = `🏆 *Live Sports Scores*\n📡 Powered by DavidCyrilTech\n`;
      await react('✅');
      reply((header + body + `\n> 🤖 *AA MD Bot*`).trim());
    } catch (e) {
      await react('❌');
      reply(`❌ *Live Scores Failed*\n\n${e.message}\n\nTry again in a moment.\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
