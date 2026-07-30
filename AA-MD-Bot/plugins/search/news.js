// ============================================
// AA MD Bot - News
// Primary:  DavidCyrilTech /news/{category}
//           (tech, sports, world, entertainment, science,
//            health, business, crypto, gaming, politics,
//            bollywood, finance, education)
// Fallback: Guardian "test" key + BBC RSS
// ============================================

import axios from 'axios';

const DC       = 'https://apis.davidcyriltech.my.id';
const GUARDIAN = 'https://content.guardianapis.com/search';
const BBC_RSS  = 'https://feeds.bbci.co.uk/news';

// DC /news/{category} confirmed working: tech, sports, world, entertainment
// Everything else falls through to Guardian → BBC
const DC_CATEGORY_MAP = {
  tech:          'tech',    technology:    'tech',
  sport:         'sports',  sports:        'sports', cricket:  'sports',
  football:      'sports',  soccer:        'sports',
  world:         'world',   global:        'world',  international: 'world',
  entertainment: 'entertainment', movie:   'entertainment', movies: 'entertainment',
  celeb:         'entertainment', celebrity: 'entertainment',
};

// BBC RSS fallback slug map
const BBC_TOPIC_MAP = {
  tech: '/technology', technology: '/technology',
  sport: '/sport',     sports: '/sport',
  business: '/business', finance: '/business',
  science: '/science',
  health: '/health',   medical: '/health',
  world: '',           global: '',
};

function parseRss(xml) {
  const items = [];
  const itemRx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRx.exec(xml)) !== null && items.length < 5) {
    const block = m[1];
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) || /<title>(.*?)<\/title>/.exec(block) || [])[1] || '';
    const link  = (/<link>(.*?)<\/link>/.exec(block) || [])[1] || '';
    const pub   = (/<pubDate>(.*?)<\/pubDate>/.exec(block) || [])[1] || '';
    if (title) items.push({ title: title.trim(), url: link.trim(), date: pub.trim() });
  }
  return items;
}

async function fromDC(category) {
  const { data } = await axios.get(`${DC}/news/${category}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 12000,
  });
  if (!data?.success || !data.articles?.length) throw new Error('No articles');
  return {
    articles: data.articles.slice(0, 5).map(a => ({
      title:  a.title,
      url:    a.link,
      date:   a.pubDate ? a.pubDate.split('T')[0] : '',
      desc:   a.description || '',
      source: a.source || '',
    })),
    sources: data.sources || [],
  };
}

async function fromGuardian(topic) {
  const { data } = await axios.get(GUARDIAN, {
    params: {
      q: topic,
      'api-key': 'test',
      'show-fields': 'headline,trailText',
      'page-size': 5,
      'order-by': 'newest',
    },
    timeout: 10000,
  });
  const articles = (data?.response?.results || []).map(r => ({
    title:  r.fields?.headline || r.webTitle,
    url:    r.webUrl,
    date:   r.webPublicationDate?.split('T')[0] || '',
    desc:   r.fields?.trailText || '',
    source: 'The Guardian',
  }));
  if (!articles.length) throw new Error('No articles');
  return { articles, sources: ['The Guardian'] };
}

async function fromBBC(topic) {
  const slug = BBC_TOPIC_MAP[topic.toLowerCase()] ?? '';
  const feed = `${BBC_RSS}${slug}/rss.xml`;
  const { data } = await axios.get(feed, { timeout: 10000 });
  const articles = parseRss(data);
  if (!articles.length) throw new Error('No articles');
  return { articles, sources: ['BBC News'] };
}

export default {
  command: 'news',
  alias: ['headlines', 'breakingnews', 'latestnews'],
  description: 'Latest news headlines — tech, sports, world, crypto, bollywood, politics & more',
  category: 'search',

  async execute({ reply, args, react, prefix }) {
    const input   = args.join(' ').trim() || 'world';
    const keyword = input.toLowerCase();
    await react('📰');

    let result  = null;
    let source  = '';
    let usedCat = keyword;

    // 1️⃣ Try DC API if keyword maps to a category
    const dcCat = DC_CATEGORY_MAP[keyword];
    if (dcCat) {
      try {
        result  = await fromDC(dcCat);
        source  = result.sources.length ? result.sources.join(', ') : 'DavidCyrilTech';
        usedCat = dcCat;
      } catch { /* fall through */ }
    }

    // 2️⃣ Guardian (free "test" key)
    if (!result) {
      try {
        result = await fromGuardian(input);
        source = 'The Guardian';
      } catch { /* fall through */ }
    }

    // 3️⃣ BBC RSS
    if (!result) {
      try {
        result = await fromBBC(keyword);
        source = 'BBC News';
      } catch (e) {
        return reply(`❌ *News Unavailable*\n\nCouldn't fetch news right now. Try again later.\n\n> 📰 *AA MD Bot*`);
      }
    }

    if (!result?.articles?.length) {
      return reply(
        `📰 No articles found for *"${input}"*.\n\n` +
        `*Try these:* tech • sports • world • entertainment\n` +
        `science • health • business • crypto • politics\n\n` +
        `*Example:* ${prefix}news tech\n\n> 📰 *AA MD Bot*`
      );
    }

    let text = `📰 *${usedCat.toUpperCase()} — Latest News*\n`;
    text += `📡 Source: ${source}\n`;
    text += `${'─'.repeat(28)}\n\n`;

    result.articles.forEach((a, i) => {
      text += `*${i + 1}. ${a.title}*\n`;
      if (a.source && a.source !== source) text += `   📰 ${a.source}\n`;
      if (a.desc) text += `   📝 ${a.desc.replace(/<[^>]+>/g, '').substring(0, 120)}…\n`;
      if (a.date) text += `   📅 ${a.date}\n`;
      text += `   🔗 ${a.url}\n\n`;
    });

    // Help footer showing available categories
    text +=
      `💡 *Categories:* tech • sports • world • entertainment\n` +
      `   science • health • business • crypto • gaming\n` +
      `   politics • bollywood • finance • education\n\n` +
      `> 📰 *AA MD Bot*`;

    await react('✅');
    reply(text.trim());
  },
};
