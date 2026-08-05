// AA MD Bot — Live Sports Scores
// Primary: DavidCyrilTech /sports/live  (NFL, NBA, Soccer)
// Cricket:  ESPN cricket multi-slug scanner (ODI / T20I / Test)
// Usage:
//   .livescore              → all active sports
//   .livescore cricket      → cricket only (multi-format scan)
//   .livescore nba          → NBA only
import axios from 'axios';

const DC   = 'https://apis.davidcyriltech.my.id';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

// ── Cricket: try these ESPN league slugs in order until one returns events ──
const CRICKET_SLUGS = [
  'icc-odi-championship',
  'icc-test-championship',
  'icc-men-t20-world-cup',
  'icc-cricket-world-cup',
  'icc-women-t20-world-cup',
  'big-bash',
  't20-blast',
  'pakistan-super-league',
  'indian-premier-league',
  'caribbean-premier-league',
  'sa20',
];

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
  if (s.includes('live') || s.includes('progress') || s.includes('quarter') || s.includes('half') || s.includes('inning') || s.includes('over')) return '🔴';
  if (s.includes('final') || s.includes('finished') || s.includes('ended') || s.includes('complete')) return '✅';
  if (s.includes('scheduled') || s.includes('upcoming') || s.includes('not started')) return '⏳';
  if (s.includes('halftime') || s.includes('break') || s.includes('lunch') || s.includes('tea') || s.includes('drinks')) return '⏸️';
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

// ── Cricket: render one ESPN cricket event ───────────────────────────────────
function renderCricketEvent(e, leagueName) {
  const comp    = e.competitions?.[0];
  const teams   = comp?.competitors || [];
  const home    = teams.find(t => t.homeAway === 'home') || teams[0];
  const away    = teams.find(t => t.homeAway === 'away') || teams[1];
  const status  = e.status?.type?.description || comp?.status?.type?.shortDetail || '';
  const emoji   = statusEmoji(status);
  const hn      = home?.team?.shortDisplayName || home?.team?.displayName || '?';
  const an      = away?.team?.shortDisplayName || away?.team?.displayName || '?';

  let line = `${emoji} *${an} vs ${hn}*`;
  if (leagueName) line += `  _[${leagueName}]_`;
  line += '\n';

  // Scores — may include innings in cricket
  const hs = home?.score ?? '';
  const as_ = away?.score ?? '';
  if (hs || as_) line += `   🏏 ${an}: ${as_}  |  ${hn}: ${hs}\n`;

  // Situation (overs, wickets, run rate)
  const sit = comp?.situation || comp?.status?.situation;
  if (sit) {
    if (sit.batsmanOnStrikeName) line += `   🏃 ${sit.batsmanOnStrikeName}`;
    if (sit.runs !== undefined && sit.wickets !== undefined) {
      line += `   📊 ${sit.runs}/${sit.wickets} (${sit.overs || '?'} ov)`;
    }
    if (sit.currentRunRate) line += `  RR: ${sit.currentRunRate}`;
    if (sit.requiredRunRate) line += `  RRR: ${sit.requiredRunRate}`;
    line += '\n';
  }

  if (status) line += `   📌 ${status}\n`;

  const venue = comp?.venue?.fullName;
  if (venue) line += `   🏟️ ${venue}\n`;

  const dt = e.date;
  if (dt && /scheduled|not started/i.test(status)) {
    line += `   📅 ${fmtDate(dt)}\n`;
  }

  return line;
}

// ── Fetch cricket events from ESPN (tries all slugs, combines results) ────────
async function fetchCricketEvents() {
  const seen    = new Set();
  const events  = [];
  const headers = { 'User-Agent': 'Mozilla/5.0' };

  // Try all slugs in parallel — collect whatever responds
  const results = await Promise.allSettled(
    CRICKET_SLUGS.map(slug =>
      axios.get(`${ESPN}/cricket/${slug}/scoreboard`, { headers, timeout: 10000 })
    )
  );

  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const data   = r.value?.data;
    const league = data?.leagues?.[0]?.name || data?.league?.name || CRICKET_SLUGS[i];
    const evts   = data?.events || [];
    for (const e of evts) {
      if (!e?.id || seen.has(e.id)) continue;
      seen.add(e.id);
      events.push({ event: e, league });
    }
  });

  return events;
}

export default {
  command: 'livescore',
  alias: ['scores', 'livescores', 'sports', 'sportnews', 'sportslive', 'cricket', 'cricketlive', 'livecricket'],
  description: 'Live sports scores — filter by sport: .livescore cricket',
  category: 'tools',

  async execute({ text, reply, react, prefix, command }) {
    // If invoked as .cricket/.cricketlive force filter to cricket
    const isCricketCmd = ['cricket', 'cricketlive', 'livecricket'].includes(command);
    const raw    = (text || '').trim().toLowerCase();
    const filter = isCricketCmd ? 'cricket' : (raw ? (SPORT_ALIAS[raw] || raw) : null);

    await react('⚽');

    // ── Dedicated cricket path ────────────────────────────────────────────────
    if (filter === 'cricket') {
      await react('🏏');
      try {
        const cricketEvents = await fetchCricketEvents();

        if (!cricketEvents.length) {
          await react('⏳');
          return reply(
            `🏏 *Cricket Live Scores*\n\n` +
            `No live or upcoming cricket matches found right now.\n\n` +
            `📡 Live links:\n` +
            `• https://www.cricbuzz.com/cricket-match/live-scores\n` +
            `• https://www.espncricinfo.com/live-cricket-score\n` +
            `• https://www.flashscore.com/cricket\n\n` +
            `> 🤖 *AA MD Bot*`
          );
        }

        // Sort: live first, then scheduled
        const live      = cricketEvents.filter(({ event: e }) => !/scheduled|not started/i.test(e.status?.type?.description || ''));
        const scheduled = cricketEvents.filter(({ event: e }) =>  /scheduled|not started/i.test(e.status?.type?.description || ''));
        const sorted    = [...live, ...scheduled].slice(0, 8);

        let body = '';
        for (const { event: e, league } of sorted) {
          body += renderCricketEvent(e, league) + '\n';
        }

        await react('✅');
        return reply(
          `🏏 *Cricket Live Scores*\n` +
          `📡 ESPN Cricket\n` +
          `─────────────────────────\n` +
          body.trim() +
          `\n\n📊 More: https://www.cricbuzz.com/cricket-match/live-scores\n` +
          `> 🤖 *AA MD Bot*`
        );
      } catch (e) {
        await react('❌');
        return reply(
          `🏏 *Cricket Scores*\n\n` +
          `Couldn't fetch live data. Check directly:\n` +
          `• https://www.cricbuzz.com/cricket-match/live-scores\n` +
          `• https://www.espncricinfo.com/live-cricket-score\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      }
    }

    // ── General DC sports path ────────────────────────────────────────────────
    try {
      const { data } = await axios.get(`${DC}/sports/live`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 18000,
      });

      if (!data?.success) throw new Error(data?.error || 'No data returned');

      // If user specified a sport (non-cricket)
      if (filter) {
        const sportData = data[filter];
        if (!sportData?.count) {
          const available = Object.keys(data)
            .filter(k => k !== 'creator' && k !== 'success' && data[k]?.count)
            .join(', ');
          await react('❌');
          return reply(
            `⚽ *No "${filter}" data right now.*\n\n` +
            `Available: ${available || 'none at this moment'}\n` +
            `💡 Try: ${prefix}livescore cricket\n\n` +
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

      // Show all sports from DC
      let body  = '';
      let found = 0;
      const shown = new Set();

      for (const [key, meta] of Object.entries(SPORT_META)) {
        if (shown.has(meta.label)) continue;
        if (data[key]) {
          const block = renderSport(meta.label, meta.emoji, data[key]);
          if (block) { body += block; found++; shown.add(meta.label); }
        }
      }

      for (const [key, val] of Object.entries(data)) {
        if (key === 'creator' || key === 'success') continue;
        if (SPORT_META[key]) continue;
        if (val?.count) { body += renderSport(key.toUpperCase(), '🏆', val); found++; }
      }

      if (!found) {
        await react('⏳');
        return reply(
          `📊 *Live Scores*\n\nNo live games right now.\n\n` +
          `💡 Try: ${prefix}livescore cricket  |  ${prefix}livescore nba  |  ${prefix}livescore soccer\n\n> 🤖 *AA MD Bot*`
        );
      }

      await react('✅');
      reply(
        `🏆 *Live Sports Scores*\n📡 DavidCyrilTech\n` +
        body +
        `\n💡 Filter: ${prefix}livescore <sport>  (e.g. cricket, nba, nfl, soccer)\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (e) {
      await react('❌');
      reply(`❌ *Live Scores Failed*\n\n${e.message}\n\nTry: ${prefix}livescore cricket\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
