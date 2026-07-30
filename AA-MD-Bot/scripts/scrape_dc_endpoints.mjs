import https from 'https';

function get(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        req.destroy(); return get(r.headers.location).then(res).catch(rej);
      }
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.setTimeout(20000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}

const cats = ['games','tools','search','download','fun','ai','canvas','imagegen','random','news','movies','stalk','tempmail','sports','anime','uploader','urlshortener'];

for (const cat of cats) {
  const html = await get(`https://apis.davidcyriltech.my.id/endpoints/${cat}/`);
  // Extract URL patterns like: apis.davidcyril*.my.id/some/path?params
  const domainRe = /apis\.davidcyril[a-z.]+\/([a-zA-Z0-9/_?=&%+.-]+)/g;
  const urls = new Set();
  let m;
  while ((m = domainRe.exec(html)) !== null) {
    const path = '/' + m[1].split('"')[0].split("'")[0].split('`')[0].split('<')[0].split(' ')[0].replace(/\\$/, '');
    if (path.length > 3 && !path.includes('og-image') && !path.includes('favicon') && !path.includes('endpoints/')) {
      urls.add(path);
    }
  }
  if (urls.size > 0) {
    console.log(`\n=== ${cat.toUpperCase()} ===`);
    for (const u of urls) console.log(u);
  } else {
    console.log(`\n=== ${cat.toUpperCase()} === (no URLs found)`);
  }
  await new Promise(r => setTimeout(r, 250));
}
