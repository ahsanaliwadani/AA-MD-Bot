// AA MD Bot — Soccer Stats
// Commands: .standings .topscorers .upcomingmatches .gamehistory .surebet .sportnews
// API: ESPN public soccer API (no key needed)
import axios from 'axios';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const HDR = { 'User-Agent': 'Mozilla/5.0' };

// Map common league names → ESPN league slugs
const LEAGUE_SLUGS = {
  'premier league': 'eng.1', 'epl': 'eng.1', 'pl': 'eng.1',
  'la liga': 'esp.1',   'laliga': 'esp.1',   'spain': 'esp.1',
  'bundesliga': 'ger.1', 'germany': 'ger.1',
  'serie a': 'ita.1',   'seriea': 'ita.1',   'italy': 'ita.1',
  'ligue 1': 'fra.1',   'ligue1': 'fra.1',   'france': 'fra.1',
  'champions league': 'UEFA.CHAMPIONS', 'ucl': 'UEFA.CHAMPIONS', 'cl': 'UEFA.CHAMPIONS',
  'europa league': 'UEFA.EUROPA', 'uel': 'UEFA.EUROPA',
  'mls': 'usa.1',
  'eredivisie': 'ned.1',
  'brasileirao': 'bra.1',
  'super lig': 'tur.1', 'turkey': 'tur.1',
  'pro league': 'sau.1', 'saudi': 'sau.1',
};

function leagueSlug(text) {
  const key = (text || 'premier league').toLowerCase().trim();
  return LEAGUE_SLUGS[key] || LEAGUE_SLUGS['premier league'];
}

function leagueDisplay(text) {
  if (!text) return 'Premier League';
  const key = text.toLowerCase().trim();
  // Return original title-cased if not found
  return Object.keys(LEAGUE_SLUGS).find(k => k === key)
    ?.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
    || text.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export default {
  command: 'standings',
  alias: ['topscorers', 'upcomingmatches', 'upcoming', 'gamehistory', 'matchhistory', 'surebet', 'sportnews', 'footballnews', 'footballstats'],
  description: 'Soccer stats — standings, topscorers, upcoming, history, news',
  category: 'tools',

  async execute({ command, args, text, reply, react, prefix }) {
    const league = text || '';
    const team   = text || 'chelsea';

    // ── .standings ─────────────────────────────────────────────────────────
    if (command === 'standings') {
      await react('🏆');
      const slug    = leagueSlug(league);
      const display = leagueDisplay(league);
      try {
        const res    = await axios.get(`${ESPN_BASE}/${slug}/standings`, { headers: HDR, timeout: 12000 });
        const groups = res.data?.standings?.entries
          || res.data?.children?.[0]?.standings?.entries
          || [];
        if (!groups.length) throw new Error('no data');

        const list = groups.slice(0, 10).map((e, i) => {
          const stat = (name) => e.stats?.find(s => s.name === name)?.value ?? '?';
          const pts  = stat('points');
          const gp   = stat('gamesPlayed');
          const w    = stat('wins');
          const d    = stat('ties');
          const l    = stat('losses');
          const gd   = stat('pointDifferential') !== '?' ? stat('pointDifferential') : stat('goalDifference');
          return `*${i + 1}.* ${e.team?.displayName || '?'} | P:${gp} W:${w} D:${d} L:${l} GD:${gd} *Pts:${pts}*`;
        }).join('\n');

        await react('✅');
        return reply(
          `🏆 *${display} Standings*\n📡 ESPN\n\n${list}\n\n` +
          `💡 Try: ${prefix}standings la liga\n> 🤖 *AA MD Bot*`
        );
      } catch {
        await react('❌');
        return reply(
          `🏆 *${display} Standings*\n\n` +
          `🔗 https://www.flashscore.com/football/\n` +
          `🔗 https://www.bbc.com/sport/football/tables\n\n> 🤖 *AA MD Bot*`
        );
      }
    }

    // ── .topscorers ─────────────────────────────────────────────────────────
    if (command === 'topscorers') {
      await react('⚽');
      const slug    = leagueSlug(league);
      const display = leagueDisplay(league);
      try {
        const res   = await axios.get(`${ESPN_BASE}/${slug}/leaders`, { headers: HDR, timeout: 12000 });
        const cats  = res.data?.categories || [];
        const goalsCat = cats.find(c =>
          c.name?.toLowerCase().includes('goal') || c.abbreviation === 'G' || c.abbreviation === 'Goals'
        );
        const leaders = goalsCat?.leaders?.slice(0, 10) || [];
        if (!leaders.length) throw new Error('no scorers');

        const list = leaders.map((l, i) =>
          `*${i + 1}.* ${l.athlete?.displayName || '?'} _(${l.team?.abbreviation || '?'})_ — ⚽ *${l.value}* goals`
        ).join('\n');

        await react('✅');
        return reply(
          `⚽ *Top Scorers: ${display}*\n📡 ESPN\n\n${list}\n\n` +
          `💡 Try: ${prefix}topscorers bundesliga\n> 🤖 *AA MD Bot*`
        );
      } catch {
        await react('❌');
        return reply(
          `⚽ *Top Scorers: ${display}*\n\n` +
          `🔗 https://www.whoscored.com\n` +
          `🔗 https://www.bbc.com/sport/football/premier-league/top-scorers\n\n> 🤖 *AA MD Bot*`
        );
      }
    }

    // ── .upcomingmatches ────────────────────────────────────────────────────
    if (['upcomingmatches', 'upcoming'].includes(command)) {
      await react('📅');
      try {
        // Find team ID from Premier League teams list
        const teamsRes = await axios.get(`${ESPN_BASE}/eng.1/teams`, { headers: HDR, timeout: 12000 });
        const teams    = teamsRes.data?.sports?.[0]?.leagues?.[0]?.teams || [];
        const found    = teams.find(t =>
          t.team?.displayName?.toLowerCase().includes(team.toLowerCase()) ||
          t.team?.abbreviation?.toLowerCase() === team.toLowerCase() ||
          t.team?.shortDisplayName?.toLowerCase().includes(team.toLowerCase())
        );
        if (!found?.team?.id) throw new Error(`Team "${team}" not found`);

        const tid   = found.team.id;
        const sched = await axios.get(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${tid}/schedule`,
          { headers: HDR, timeout: 12000 }
        );
        const upcoming = (sched.data?.events || [])
          .filter(e => new Date(e.date) > new Date())
          .slice(0, 5);
        if (!upcoming.length) throw new Error('no matches');

        const list = upcoming.map(e => {
          const d    = new Date(e.date);
          const comp = e.competitions?.[0];
          const home = comp?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName || '?';
          const away = comp?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName || '?';
          const dt   = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          return `📅 *${dt}*\n   ${home} vs ${away}`;
        }).join('\n\n');

        await react('✅');
        return reply(
          `📅 *Upcoming: ${found.team.displayName}*\n📡 ESPN\n\n${list}\n\n` +
          `💡 Try: ${prefix}upcoming real madrid\n> 🤖 *AA MD Bot*`
        );
      } catch (err) {
        await react('❌');
        return reply(
          `📅 *Upcoming: ${team}*\n\n` +
          `🔗 https://www.espn.com/soccer/search/_/q/${encodeURIComponent(team)}\n\n> 🤖 *AA MD Bot*`
        );
      }
    }

    // ── .gamehistory ────────────────────────────────────────────────────────
    if (['gamehistory', 'matchhistory'].includes(command)) {
      await react('📋');
      try {
        const teamsRes = await axios.get(`${ESPN_BASE}/eng.1/teams`, { headers: HDR, timeout: 12000 });
        const teams    = teamsRes.data?.sports?.[0]?.leagues?.[0]?.teams || [];
        const found    = teams.find(t =>
          t.team?.displayName?.toLowerCase().includes(team.toLowerCase()) ||
          t.team?.abbreviation?.toLowerCase() === team.toLowerCase() ||
          t.team?.shortDisplayName?.toLowerCase().includes(team.toLowerCase())
        );
        if (!found?.team?.id) throw new Error(`Team "${team}" not found`);

        const tid   = found.team.id;
        const sched = await axios.get(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${tid}/schedule`,
          { headers: HDR, timeout: 12000 }
        );
        const past = (sched.data?.events || [])
          .filter(e => new Date(e.date) < new Date())
          .slice(-5)
          .reverse();
        if (!past.length) throw new Error('no history');

        const list = past.map(e => {
          const d    = new Date(e.date);
          const comp = e.competitions?.[0];
          const home = comp?.competitors?.find(c => c.homeAway === 'home');
          const away = comp?.competitors?.find(c => c.homeAway === 'away');
          const hn   = home?.team?.displayName || '?';
          const an   = away?.team?.displayName || '?';
          const hs   = home?.score ?? '-';
          const as_  = away?.score ?? '-';
          const dt   = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          return `📅 *${dt}*  ${hn} *${hs}–${as_}* ${an}`;
        }).join('\n');

        await react('✅');
        return reply(
          `📋 *Match History: ${found.team.displayName}*\n📡 ESPN\n\n${list}\n\n` +
          `💡 Try: ${prefix}gamehistory barcelona\n> 🤖 *AA MD Bot*`
        );
      } catch {
        await react('❌');
        return reply(
          `📋 *Match History: ${team}*\n\n` +
          `🔗 https://www.espn.com/soccer/search/_/q/${encodeURIComponent(team)}\n\n> 🤖 *AA MD Bot*`
        );
      }
    }

    // ── .surebet ────────────────────────────────────────────────────────────
    if (command === 'surebet') {
      await react('💰');
      return reply(
        `💰 *Sure Bets & Predictions*\n\n` +
        `📊 Best prediction sites:\n` +
        `• 🔗 https://www.betensured.com\n` +
        `• 🔗 https://www.soccervista.com\n` +
        `• 🔗 https://www.forebet.com\n` +
        `• 🔗 https://www.predictz.com\n` +
        `• 🔗 https://www.soccerway.com\n\n` +
        `⚠️ _Bet responsibly. Never wager more than you can afford to lose._\n\n> 🤖 *AA MD Bot*`
      );
    }

    // ── .sportnews ──────────────────────────────────────────────────────────
    if (['sportnews', 'footballnews', 'footballstats'].includes(command)) {
      await react('📰');
      try {
        const res = await axios.get(
          'https://saurav.tech/NewsAPI/top-headlines/category/sports/us.json',
          { timeout: 10000 }
        );
        const articles = (res.data?.articles || []).slice(0, 5);
        if (!articles.length) throw new Error('no articles');

        const list = articles.map((a, i) =>
          `*${i + 1}.* ${a.title}\n   📰 _${a.source?.name}_ • ${a.publishedAt?.split('T')[0]}`
        ).join('\n\n');

        await react('✅');
        return reply(
          `🏆 *Sports News*\n📡 News API\n\n${list}\n\n` +
          `🔗 https://www.bbc.com/sport\n> 🤖 *AA MD Bot*`
        );
      } catch {
        await react('❌');
        return reply(
          `🏆 *Sports News*\n\n📰 Latest:\n` +
          `• https://www.bbc.com/sport\n` +
          `• https://www.espn.com\n` +
          `• https://www.goal.com\n\n> 🤖 *AA MD Bot*`
        );
      }
    }

    // ── fallback help ────────────────────────────────────────────────────────
    return reply(
      `⚽ *Soccer Stats Commands*\n\n` +
      `• *${prefix}standings* [league] — table\n` +
      `• *${prefix}topscorers* [league] — top goalscorers\n` +
      `• *${prefix}upcoming* [team] — next matches\n` +
      `• *${prefix}gamehistory* [team] — recent results\n` +
      `• *${prefix}surebet* — prediction sites\n` +
      `• *${prefix}sportnews* — latest sports news\n\n` +
      `📋 Leagues: premier league, la liga, bundesliga, serie a, ligue 1, ucl\n\n> 🤖 *AA MD Bot*`
    );
  },
};
