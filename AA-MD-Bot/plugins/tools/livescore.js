// AA MD Bot — Live Sports Scores
// Uses: DavidCyrilTech /sports/live
// Usage: .livescore              → all active sports
//        .livescore cricket      → cricket only
//        .livescore nba          → NBA only
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';

// Emoji + display name for each sport key
const SPORT_META = {
  nfl:           { emoji: '🏈', label: 'NFL (American Football)' },
  nba:           { emoji: '🏀', label: 'NBA (Basketball)' },
  nhl:           { emoji: '🏒', label: 'NHL (Ice Hockey)' },
  mlb:           { emoji: '⚾', label: 'MLB (Baseball)' },
  soccer:        { emoji: '⚽', label: 'Soccer / Football' },
  mls:           { emoji: '⚽', label: 'MLS' },
  premierleague: { emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', label: 'Premier League' },
  laliga:        { emoji: '🇪🇸', label: 'La Liga' },
  bundesliga:    { emoji: '🇩🇪', label: 'Bundesliga' },
  seriea:        { emoji: '🇮🇹', label: 'Serie A' },
  cricket:       { emoji: '🏏', label: 'Cricket' },
  tennis:        { emoji: '🎾', label: 'Tennis' },
  formula1:      { emoji: '🏎️', label: 'Formula 1' },
  f1:            { emoji: '🏎️', label: 'Formula 1' },
  golf:          { emoji: '⛳', label: 'Golf' },
  ufc:           { emoji: '🥊', label: 'UFC / MMA' },
  rugby:         { emoji: '🏉', label: 'Rugby' },
};

// Allow natural-language aliases → canonical keys
const SPORT_ALIAS = {
  football: 'soccer', futbol: 'soccer',
  basketball: 'nba', hoops: 'nba',
  hockey: 'nhl', icehockey: 'nhl',
  baseball: 'mlb',
  americanfootball: 'nfl',
  mma: 'ufc', boxing: 'ufc',
  f1: 'formula1', 'formula 1': 'formula1', formulaone: 'formula1',
};

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
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

function renderGame(g) {
  const home  = g.homeTeam;
  const away  = g.awayTeam;
  const emoji = statusEmoji(g.status);
  let line = `${emoji} *${away?.shortName || away?.name || '?'} vs ${home?.shortName || home?.name || '?'}*\n`;
  if (g.status && !/scheduled|not started/i.test(g.status)) {
    line += `   Score: ${away?.score ?? '0'} — ${home?.score ?? '0'}`;
    if (g.clock && g.clock !== '0:00') line += ` (${g.clock})`;
    line += '\n';
  } else if (g.date) {
    line += `   📅 ${fmtDate(g.date)}\n`;
  }
  if (g.venue) line += `   🏟️ ${g.venue}\n`;
  return line;
}

function renderSport(label, emoji, sportData, maxGames = 5) {
  if (!sportData?.count || !sportData.games?.length) return '';
  const games = sportData.games.slice(0, maxGames);
  let out = `\n${emoji} *${label}* (${sportData.count} game${sportData.count !== 1 ? 's' : ''})\n`;
  out += '─'.repeat(24) + '\n';
  games.forEach(g => { out += renderGame(g); });
  if (sportData.count > maxGames) out += `   _+${sportData.count - maxGames} more…_\n`;
  return out;
}

export default {
  command: 'livescore',
  alias: ['scores', 'livescores', 'sports', 'sportnews', 'sportslive'],
  description: 'Live sports scores — filter by sport: .livescore cricket',
  category: 'tools',

  async execute({ text, reply, react, prefix }) {
    const raw    = (text || '').trim().toLowerCase();
    const filter = raw ? (SPORT_ALIAS[raw] || raw) : null; // canonical sport key or null = show all

    await react('⚽');
    try {
      const { data } = await axios.get(`${DC}/sports/live`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 18000,
      });

      if (!data?.success) throw new Error(data?.error || 'No data returned');

      // If user specified a sport, check it exists in response
      if (filter) {
        const sportData = data[filter];
        if (!sportData?.count) {
          // List what IS available
          const available = Object.keys(data)
            .filter(k => k !== 'creator' && k !== 'success' && data[k]?.count)
            .join(', ');
          await react('❌');
          return reply(
            `⚽ *No "${filter}" data right now.*\n\n` +
            `Available sports: ${available || 'none at this moment'}\n\n` +
            `> 🤖 *AA MD Bot*`
          );
        }
        const meta  = SPORT_META[filter] || { emoji: '🏆', label: filter.toUpperCase() };
        const block = renderSport(meta.label, meta.emoji, sportData);
        await react('✅');
        return reply(
          `🏆 *${meta.emoji} ${meta.label} Scores*\n📡 DavidCyrilTech\n` +
          block +
          `\n> 🤖 *AA MD Bot*`
        );
      }

      // Show all sports
      let body  = '';
      let found = 0;
      const shown = new Set();

      for (const [key, meta] of Object.entries(SPORT_META)) {
        if (shown.has(meta.label)) continue; // skip f1 duplicate
        if (data[key]) {
          const block = renderSport(meta.label, meta.emoji, data[key]);
          if (block) { body += block; found++; shown.add(meta.label); }
        }
      }

      // Any extra keys not in the map
      for (const [key, val] of Object.entries(data)) {
        if (key === 'creator' || key === 'success') continue;
        if (SPORT_META[key]) continue;
        if (val?.count) { body += renderSport(key.toUpperCase(), '🏆', val); found++; }
      }

      if (!found) {
        await react('⏳');
        return reply(
          `📊 *Live Scores*\n\nNo live or upcoming games right now. Check back later!\n\n` +
          `💡 Filter by sport: ${prefix}livescore cricket\n\n> 🤖 *AA MD Bot*`
        );
      }

      const available = Object.keys(SPORT_META)
        .filter((k, i, a) => data[k]?.count && !a.slice(0, i).some(p => SPORT_META[p]?.label === SPORT_META[k]?.label))
        .map(k => k)
        .join(' • ');

      await react('✅');
      reply(
        `🏆 *Live Sports Scores*\n📡 DavidCyrilTech\n` +
        body +
        `\n💡 Filter: ${prefix}livescore <sport>  (e.g. cricket, nba, nfl)\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (e) {
      await react('❌');
      reply(`❌ *Live Scores Failed*\n\n${e.message}\n\nTry again in a moment.\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
