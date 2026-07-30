// AA MD Bot - APK Downloader
// Method 1: DavidCyrilTech API (PRIMARY — confirmed working)
// Method 2: Aptoide API v7
// Method 3: APKCombo scrape
// Method 4: Uptodown search
import axios from 'axios';

const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const api = axios.create({ timeout: 20000, headers: { 'User-Agent': UA } });
const DC  = 'https://apis.davidcyriltech.my.id';

// ── Method 1: DavidCyrilTech ──────────────────────────────────────────────────
async function searchDavidCyril(query) {
  const { data } = await api.get(`${DC}/download/apk`, { params: { text: query } });
  // Response shape may vary; handle both { result: {...} } and flat
  const d = data?.result || data?.data || data;
  if (!d) throw new Error('no data');
  const dlUrl = d.download_link || d.download || d.apk_link || d.link || d.url || d.dlUrl || null;
  if (!dlUrl) throw new Error('no download link');
  return {
    name:    d.name    || d.app_name   || query,
    version: d.version || d.versionName || '?',
    size:    parseFloat(d.size || 0),
    pkg:     d.package || d.packageName || d.pkg || '',
    dlUrl,
    icon:    d.icon    || d.logo       || null,
    rating:  d.rating  || 'N/A',
    source:  'DavidCyrilTech',
  };
}

// ── Method 2: Aptoide ─────────────────────────────────────────────────────────
async function searchAptoide(query) {
  const { data } = await api.get('https://ws75.aptoide.com/api/7/apps/search', {
    params: { query, limit: 5, store_name: 'bazaar' },
  });
  const list = data?.datalist?.list || [];
  if (!list.length) throw new Error('no results');
  const app = list[0];
  return {
    name:    app.name,
    version: app.file?.vername || '?',
    size:    parseFloat(app.file?.filesize || 0) / (1024 * 1024),
    pkg:     app.package_name || '',
    dlUrl:   app.file?.path,
    icon:    app.icon,
    rating:  app.stats?.rating?.avg?.toFixed(1) || 'N/A',
    source:  'Aptoide',
  };
}

// ── Method 2: APKCombo scrape ─────────────────────────────────────────────────
async function searchApkCombo(query) {
  const { data } = await api.get(
    `https://apkcombo.com/search/?q=${encodeURIComponent(query)}`,
    { headers: { Accept: 'text/html', Referer: 'https://apkcombo.com/' } }
  );
  const html = typeof data === 'string' ? data : '';
  const nameMatch = html.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*href="(\/[^"]+)"[^>]*>\s*([^<]{3,50})\s*<\/a>/i);
  const verMatch  = html.match(/Version\s*:?\s*([\d.]+)/i);
  const pkgMatch  = html.match(/Package\s*:?\s*([\w.]+)/i);
  if (!nameMatch) throw new Error('parse fail');
  const slug = nameMatch[1];
  const appName = nameMatch[2].trim();
  const pkg = pkgMatch?.[1] || '';
  // Get download page
  const { data: dlPage } = await api.get(`https://apkcombo.com${slug}download/apk`, {
    headers: { Referer: `https://apkcombo.com${slug}` }
  });
  const dlHtml = typeof dlPage === 'string' ? dlPage : '';
  const dlUrl = dlHtml.match(/href="(https:\/\/download\.apkcombo\.com\/[^"]+\.apk[^"]*)"/i)?.[1];
  if (!dlUrl) throw new Error('no dl url');
  return {
    name: appName, version: verMatch?.[1] || '?',
    size: 0, pkg, dlUrl,
    icon: null, rating: 'N/A', source: 'APKCombo',
  };
}

// ── Method 3: Uptodown search (link-only) ─────────────────────────────────────
async function searchUptodown(query) {
  const { data } = await api.get(
    `https://en.uptodown.com/android/search?q=${encodeURIComponent(query)}`,
    { headers: { Accept: 'text/html', Referer: 'https://en.uptodown.com/' } }
  );
  const html = typeof data === 'string' ? data : '';
  const nameMatch = html.match(/<h2[^>]*class="name"[^>]*>([^<]+)<\/h2>/i);
  const urlMatch  = html.match(/href="(https:\/\/[^.]+\.en\.uptodown\.com\/android\/download[^"]+)"/i);
  if (!nameMatch || !urlMatch) throw new Error('no result');
  return {
    name: nameMatch[1].trim(), version: '?', size: 0, pkg: '',
    dlUrl: urlMatch[1], icon: null, rating: 'N/A', source: 'Uptodown',
  };
}

export default {
  command: 'apk',
  alias: ['apkdl', 'androidapp', 'getapk', 'apkdown'],
  category: 'download',
  description: 'Download Android APK by app name',

  async execute({ reply, react, sock, jid, msg, text, prefix }) {
    if (!text) {
      return reply(
        `📱 *APK Downloader*\n\n` +
        `*Usage:* ${prefix}apk <app name>\n` +
        `*Examples:*\n` +
        `• ${prefix}apk WhatsApp\n` +
        `• ${prefix}apk com.google.android.apps.maps\n\n` +
        `> 📦 *AA MD Bot*`
      );
    }

    await react('⏳');

    let app = null;

    // Try methods in order
    for (const [name, fn] of [
      ['DavidCyrilTech', () => searchDavidCyril(text)],
      ['Aptoide',        () => searchAptoide(text)],
      ['APKCombo',       () => searchApkCombo(text)],
      ['Uptodown',       () => searchUptodown(text)],
    ]) {
      try {
        app = await fn();
        if (app?.dlUrl) break;
      } catch (e) {
        console.warn(`[APK] ${name}: ${e.message}`);
      }
    }

    if (!app?.dlUrl) {
      await react('❌');
      return reply(
        `❌ *APK not found for:* "${text}"\n\n` +
        `Try a more exact name.\n` +
        `Or download manually:\n` +
        `🔗 https://apkpure.com/search?q=${encodeURIComponent(text)}\n\n` +
        `> 📦 *AA MD Bot*`
      );
    }

    if (app.size > 100) {
      await react('❌');
      return reply(
        `❌ *APK too large* (${app.size.toFixed(1)} MB)\n\n` +
        `Max size: 100 MB\n` +
        `Download directly:\n🔗 ${app.dlUrl}\n\n` +
        `> 📦 *AA MD Bot*`
      );
    }

    await reply(
      `📥 *Found APK*\n\n` +
      `📦 *App:* ${app.name}\n` +
      `📋 *Version:* ${app.version}\n` +
      (app.size > 0 ? `📏 *Size:* ${app.size.toFixed(1)} MB\n` : '') +
      (app.pkg ? `🔖 *Package:* ${app.pkg}\n` : '') +
      `⭐ *Rating:* ${app.rating}\n` +
      `🌐 *Source:* ${app.source}\n\n` +
      `_Downloading…_`
    );

    try {
      const { data } = await axios.get(app.dlUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 100 * 1024 * 1024,
        headers: { 'User-Agent': UA, 'Referer': 'https://aptoide.com' },
      });
      const buf = Buffer.from(data);

      await sock.sendMessage(jid,
        {
          document: buf,
          mimetype: 'application/vnd.android.package-archive',
          fileName: `${app.name.replace(/[^a-z0-9]/gi, '_')}_v${app.version}.apk`,
          caption: `📦 *${app.name}* v${app.version}\n\n> 📱 *AA MD Bot*`,
        },
        { quoted: msg }
      );
      await react('✅');
    } catch (err) {
      await react('❌');
      await reply(
        `❌ *Download failed:* ${err.message}\n\n` +
        `Download manually:\n🔗 ${app.dlUrl}\n\n` +
        `> 📦 *AA MD Bot*`
      );
    }
  },
};
