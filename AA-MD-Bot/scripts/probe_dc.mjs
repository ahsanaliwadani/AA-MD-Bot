// Probe all likely David Cyril Tech API endpoints
import https from 'https';

function get(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        req.destroy(); return get(r.headers.location).then(res).catch(rej);
      }
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    });
    req.on('error', rej);
    req.setTimeout(9000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}

async function probe(path) {
  try {
    const r = await get('https://apis.davidcyriltech.my.id' + path);
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        if (j.success === false && !j.data && !j.question && !j.fact && !j.joke && !j.riddle) return null;
        return r.body.slice(0, 160).replace(/\n/g, ' ');
      } catch { return null; }
    }
    return null;
  } catch { return null; }
}

// All candidates derived from docs page names, using common slug conventions
const candidates = [
  // === GAMES ===
  ['/trivia', 'trivia'],
  ['/trivia?category=general', 'trivia-general'],
  ['/trivia/categories', 'trivia-categories'],
  ['/riddle', 'riddle'],
  ['/joke', 'joke'],
  ['/truth', 'truth'],            // ✅ confirmed
  ['/dare', 'dare'],              // ✅ confirmed
  ['/fact', 'fact'],              // ✅ confirmed
  ['/wyr', 'wyr'],
  ['/wouldyourather', 'wouldyourather'],
  ['/8ball?question=test', '8ball'],
  ['/magic8ball?question=test', 'magic8ball'],
  ['/rps?choice=rock', 'rps'],
  ['/rockpaperscissors?choice=rock', 'rockpaperscissors'],
  ['/dice', 'dice'],
  ['/rolldice', 'rolldice'],
  ['/coinflip', 'coinflip'],
  ['/coin', 'coin'],
  ['/randomnumber', 'randomnumber'],
  ['/random-number', 'random-number'],
  ['/wordscramble', 'wordscramble'],
  ['/word-scramble', 'word-scramble'],
  ['/hangman', 'hangman'],
  ['/chess-puzzle', 'chess-puzzle'],
  ['/chesspuzzle', 'chesspuzzle'],
  ['/anime-quiz', 'anime-quiz'],
  ['/animequiz', 'animequiz'],
  ['/country-quiz', 'country-quiz'],
  ['/countryquiz', 'countryquiz'],
  ['/shipper?user1=Ali&user2=Sara', 'shipper'],
  ['/roast?name=test', 'roast'],
  ['/compliment?name=Sara', 'compliment'],
  ['/nhie', 'nhie'],
  ['/neverhaveiever', 'neverhaveiever'],
  ['/never-have-i-ever', 'never-have-i-ever'],
  ['/passwordgenerator?length=12', 'passwordgenerator'],
  ['/password?length=12', 'password'],
  ['/wordle', 'wordle'],

  // === TOOLS ===
  ['/tools/translate?text=hello&to=ur', 'tools-translate'],  // ✅
  ['/tools/weather?city=London', 'tools-weather'],            // ✅
  ['/tools/qrcode?text=hello', 'tools-qrcode'],
  ['/tools/qr?text=hello', 'tools-qr'],
  ['/tools/screenshot?url=https://google.com', 'tools-screenshot'],
  ['/tools/ss?url=https://google.com', 'tools-ss'],
  ['/tools/tinyurl?url=https://google.com', 'tools-tinyurl'],
  ['/tools/shorturl?url=https://google.com', 'tools-shorturl'],
  ['/tools/ipinfo?ip=1.1.1.1', 'tools-ipinfo'],
  ['/tools/ip?ip=1.1.1.1', 'tools-ip'],
  ['/tools/dictionary?word=love', 'tools-dictionary'],
  ['/tools/define?word=love', 'tools-define'],
  ['/tools/currency?from=USD&to=PKR&amount=1', 'tools-currency'],
  ['/tools/exchange?from=USD&to=PKR&amount=1', 'tools-exchange'],
  ['/tools/password?length=12', 'tools-password'],
  ['/tools/uuid', 'tools-uuid'],
  ['/tools/base64?text=hello&action=encode', 'tools-base64'],
  ['/tools/base64encode?text=hello', 'tools-base64encode'],
  ['/tools/base64decode?text=aGVsbG8=', 'tools-base64decode'],
  ['/tools/md5?text=hello', 'tools-md5'],
  ['/tools/sha256?text=hello', 'tools-sha256'],
  ['/tools/lorem?count=2', 'tools-lorem'],
  ['/tools/carbon?code=hello&lang=python', 'tools-carbon'],
  ['/tools/country?name=Pakistan', 'tools-country'],
  ['/tools/countryinfo?name=Pakistan', 'tools-countryinfo'],
  ['/tools/timezone?zone=Asia%2FKarachi', 'tools-timezone'],
  ['/tools/whois?domain=google.com', 'tools-whois'],
  ['/tools/dns?domain=google.com', 'tools-dns'],
  ['/tools/bmi?weight=70&height=175', 'tools-bmi'],
  ['/tools/calculator?expression=2%2B2', 'tools-calc'],
  ['/tools/calc?expression=2%2B2', 'tools-calc2'],
  ['/tools/encode?text=hello', 'tools-encode'],
  ['/tools/decode?text=aGVsbG8=', 'tools-decode'],
  ['/tools/urlshorten?url=https://google.com', 'tools-urlshorten'],

  // === SEARCH ===
  ['/search/youtube?q=music', 'search-youtube'],
  ['/search/yt?q=music', 'search-yt'],
  ['/search/google?q=hello', 'search-google'],
  ['/search/web?q=hello', 'search-web'],
  ['/search/images?q=cats', 'search-images'],
  ['/search/image?q=cats', 'search-image'],
  ['/search/wiki?q=Pakistan', 'search-wiki'],
  ['/search/wikipedia?q=Pakistan', 'search-wikipedia'],
  ['/search/dictionary?word=love', 'search-dictionary'],
  ['/search/definition?word=love', 'search-definition'],
  ['/search/github?q=nodejs', 'search-github'],
  ['/search/npm?q=axios', 'search-npm'],
  ['/search/anime?q=naruto', 'search-anime'],
  ['/search/manga?q=naruto', 'search-manga'],
  ['/search/lyrics?q=shape+of+you', 'search-lyrics'],
  ['/search/movies?q=inception', 'search-movies'],
  ['/search/books?q=harry+potter', 'search-books'],
  ['/search/recipe?q=biryani', 'search-recipe'],
  ['/search/news?q=pakistan', 'search-news'],
  ['/search/wallpaper?q=sunset', 'search-wallpaper'],
  ['/search/twitter?q=nasa', 'search-twitter'],
  ['/search/reddit?q=nodejs', 'search-reddit'],
  ['/search/apps?q=whatsapp', 'search-apps'],

  // === STALK ===
  ['/stalk/twitter?username=nasa', 'stalk-twitter'],    // ✅
  ['/stalk/pinterest?username=nasa', 'stalk-pinterest'], // ✅
  ['/stalk/snapchat?username=test', 'stalk-snapchat'],  // ✅
  ['/stalk/youtube?username=pewdiepie', 'stalk-youtube'], // ✅
  ['/stalk/github?username=torvalds', 'stalk-github'],
  ['/stalk/instagram?username=nasa', 'stalk-instagram'],
  ['/stalk/tiktok?username=mrbeast', 'stalk-tiktok'],
  ['/stalk/facebook?username=test', 'stalk-facebook'],
  ['/stalk/spotify?username=eminem', 'stalk-spotify'],
  ['/stalk/npm?package=express', 'stalk-npm'],
  ['/stalk/linkedin?username=test', 'stalk-linkedin'],
  ['/stalk/reddit?username=test', 'stalk-reddit'],
  ['/stalk/twitch?username=ninja', 'stalk-twitch'],

  // === NEWS ===
  ['/news/tech', 'news-tech'],                 // ✅
  ['/news/sports', 'news-sports'],             // ✅
  ['/news/world', 'news-world'],               // ✅
  ['/news/entertainment', 'news-entertainment'], // ✅
  ['/news/science', 'news-science'],
  ['/news/health', 'news-health'],
  ['/news/business', 'news-business'],
  ['/news/crypto', 'news-crypto'],
  ['/news/gaming', 'news-gaming'],
  ['/news/politics', 'news-politics'],
  ['/news/bollywood', 'news-bollywood'],
  ['/news/finance', 'news-finance'],
  ['/news/education', 'news-education'],

  // === RANDOM ===
  ['/random/quote', 'random-quote'],
  ['/random/fact', 'random-fact'],
  ['/random/joke', 'random-joke'],
  ['/random/meme', 'random-meme'],
  ['/random/dog', 'random-dog'],
  ['/random/cat', 'random-cat'],
  ['/random/waifu', 'random-waifu'],
  ['/random/anime', 'random-anime'],
  ['/random/riddle', 'random-riddle'],
  ['/random/color', 'random-color'],
  ['/random/password', 'random-password'],
  ['/random/word', 'random-word'],
  ['/random/name', 'random-name'],
  ['/random/number', 'random-number'],
  ['/random/truth', 'random-truth'],
  ['/random/dare', 'random-dare'],

  // === CANVAS ===
  ['/canvas/ship?user1=Alice&user2=Bob', 'canvas-ship'],
  ['/canvas/quote?text=Hello&author=DC', 'canvas-quote'],
  ['/canvas/rank?username=test&level=5&xp=100&maxXp=500&rank=1', 'canvas-rank'],
  ['/canvas/welcome?username=test&guild=Server&members=100', 'canvas-welcome'],
  ['/canvas/goodbye?username=test&guild=Server&members=100', 'canvas-goodbye'],
  ['/canvas/trivia?question=test&optionA=a&optionB=b&optionC=c&optionD=d&answer=A', 'canvas-trivia'],

  // === IMAGEGEN ===
  ['/imagine?prompt=cat', 'imagine'],
  ['/flux?prompt=cat', 'flux'],
  ['/sdxl?prompt=cat', 'sdxl'],
  ['/dalle?prompt=cat', 'dalle'],
  ['/ai-art?prompt=cat', 'ai-art'],
  ['/generate?prompt=cat', 'generate'],
  ['/imagegen/flux?prompt=cat', 'imagegen-flux'],
  ['/imagegen/sdxl?prompt=cat', 'imagegen-sdxl'],
  ['/imagegen/anime?prompt=cat', 'imagegen-anime'],
  ['/imagegen/dalle?prompt=cat', 'imagegen-dalle'],
  ['/imagegen/stable?prompt=cat', 'imagegen-stable'],
  ['/imagegen/waifu?prompt=cat', 'imagegen-waifu'],
  ['/imagegen/ghibli?prompt=cat', 'imagegen-ghibli'],
  ['/flux-realism?prompt=cat', 'flux-realism'],

  // === FUN ===
  ['/fun/joke', 'fun-joke'],
  ['/fun/fact', 'fun-fact'],
  ['/fun/quote', 'fun-quote'],
  ['/fun/meme', 'fun-meme'],
  ['/fun/roast?name=test', 'fun-roast'],
  ['/fun/truth', 'fun-truth'],
  ['/fun/dare', 'fun-dare'],

  // === AI ===
  ['/ai/chat?q=hello', 'ai-chat'],
  ['/ai/gpt?q=hello', 'ai-gpt'],
  ['/ai/gpt4o?q=hello', 'ai-gpt4o'],
  ['/ai/gemini?q=hello', 'ai-gemini'],
  ['/ai/claude?q=hello', 'ai-claude'],
  ['/ai/llama?q=hello', 'ai-llama'],
  ['/ai/deepseek?q=hello', 'ai-deepseek'],
  ['/ai/deepseek-v3?q=hello', 'ai-deepseekv3'],
  ['/ai/mistral?q=hello', 'ai-mistral'],
  ['/ai/imagine?prompt=cat', 'ai-imagine'],
  ['/ai/flux?prompt=cat', 'ai-flux'],
  ['/ai/image?prompt=cat', 'ai-image'],

  // === MOVIES ===
  ['/movies/search?q=inception', 'movies-search'],  // ✅
  ['/movies/trending', 'movies-trending'],
  ['/movies/popular', 'movies-popular'],
  ['/movies/top', 'movies-top'],
  ['/movies/info?imdbid=tt0816692', 'movies-info'],
  ['/movies/details?id=tt0816692', 'movies-details'],
  ['/movies?id=tt0816692', 'movies-id'],

  // === SPORTS ===
  ['/sports/live', 'sports-live'],    // ✅
  ['/sports/cricket', 'sports-cricket'],
  ['/sports/football', 'sports-football'],
  ['/sports/nba', 'sports-nba'],
  ['/sports/nfl', 'sports-nfl'],
  ['/sports/scores', 'sports-scores'],
  ['/sports/results', 'sports-results'],
  ['/sports/schedule', 'sports-schedule'],
  ['/sports/ipl', 'sports-ipl'],
  ['/sports/psl', 'sports-psl'],

  // === TEMPMAIL ===
  ['/tempmail/create', 'tempmail-create'],
  ['/tempmail/generate', 'tempmail-generate'],
  ['/tempmail/new', 'tempmail-new'],
  ['/tempmail/email', 'tempmail-email'],
  ['/tempmail/random', 'tempmail-random'],
  ['/tempmail/inbox?email=test@tempmail.com', 'tempmail-inbox'],
  ['/tempmail/check?email=test@tempmail.com', 'tempmail-check'],
  ['/tempmail/read?email=test@tempmail.com&id=1', 'tempmail-read'],

  // === UPLOADER ===
  ['/uploader/catbox?url=https://i.imgur.com/Y6XmQqd.jpg', 'uploader-catbox'],
  ['/uploader/imgbb?url=https://i.imgur.com/Y6XmQqd.jpg', 'uploader-imgbb'],
  ['/uploader/gofile?url=https://i.imgur.com/Y6XmQqd.jpg', 'uploader-gofile'],
  ['/uploader/pomf?url=https://i.imgur.com/Y6XmQqd.jpg', 'uploader-pomf'],
  ['/uploader/uguu?url=https://i.imgur.com/Y6XmQqd.jpg', 'uploader-uguu'],
  ['/catbox?url=https://i.imgur.com/Y6XmQqd.jpg', 'catbox'],
  ['/imgbb?url=https://i.imgur.com/Y6XmQqd.jpg', 'imgbb'],

  // === URL SHORTENER ===
  ['/tinyurl?url=https://google.com', 'tinyurl'],           // ✅
  ['/urlshortener/tinyurl?url=https://google.com', 'urlshortener-tinyurl'],
  ['/urlshortener/bitly?url=https://google.com', 'urlshortener-bitly'],
  ['/urlshortener/isgd?url=https://google.com', 'urlshortener-isgd'],
  ['/urlshortener/vgd?url=https://google.com', 'urlshortener-vgd'],
  ['/bitly?url=https://google.com', 'bitly'],
  ['/is.gd?url=https://google.com', 'isgd'],
  ['/v.gd?url=https://google.com', 'vgd'],
  ['/shorturl?url=https://google.com', 'shorturl'],
  ['/shorten?url=https://google.com', 'shorten'],

  // === WEATHER ===
  ['/weather?city=London', 'weather'],  // ✅ confirmed
];

const working = [];
for (const [path, name] of candidates) {
  const r = await probe(path);
  if (r) {
    working.push([path, name, r]);
    console.log(`✅ ${name}: ${path}\n   => ${r.slice(0, 100)}\n`);
  }
  await new Promise(r => setTimeout(r, 100));
}

console.log(`\n=== WORKING ENDPOINTS (${working.length}) ===`);
working.forEach(([path, name]) => console.log(`${name}: ${path}`));
