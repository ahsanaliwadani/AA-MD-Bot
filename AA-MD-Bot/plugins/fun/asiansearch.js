// AA MD Bot — Asian Content Search (18+)
// API: DavidCyrilTech /xxx/asiantolick?q=<query>
import axios from 'axios';

const DC     = 'https://apis.davidcyriltech.my.id';
const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FOOTER = '\n\n> 🔞 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*';

export default {
  command: 'asian',
  alias: ['asiantolick', 'asiansearch', 'asianvideo', 'asiandl'],
  description: 'Search & send Asian content 🔞 (DC API)',
  category: 'fun',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    const query = (text || '').trim();

    if (!query) {
      return reply(
        `🔞 *Asian Content Search*\n\n` +
        `*Usage:* ${prefix}asian <search>\n` +
        `*Examples:*\n` +
        `▸ ${prefix}asian cosplay\n` +
        `▸ ${prefix}asian cute\n\n` +
        `⚠️ _Adult content — 18+ only_${FOOTER}`
      );
    }

    await react('🔞');

    try {
      const { data } = await axios.get(`${DC}/xxx/asiantolick`, {
        params: { q: query },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      if (data?.success === false) throw new Error(data?.message || data?.error || 'No results');

      // Response may be array or { result: [...] }
      const list = Array.isArray(data)
        ? data
        : (data?.result || data?.data || data?.videos || data?.results || []);

      if (!list.length) throw new Error('No results found for: ' + query);

      // Pick first result with a video/image URL
      const item = list[0];
      const videoUrl = item?.video  || item?.video_url || item?.url     || item?.link      || null;
      const imageUrl = item?.image  || item?.thumb     || item?.thumbnail || item?.preview || null;
      const title    = item?.title  || item?.name      || query;
      const views    = item?.views  || item?.view_count || '';
      const duration = item?.duration || '';

      const caption =
        `🔞 *Asian — ${title.slice(0, 80)}*\n\n` +
        (views    ? `👁️ ${views}` : '') +
        (duration ? `   ⏱️ ${duration}` : '') +
        `${FOOTER}`;

      if (videoUrl) {
        await sock.sendMessage(jid, {
          video: { url: videoUrl },
          mimetype: 'video/mp4',
          caption,
        }, { quoted: msg });
        await react('✅');
      } else if (imageUrl) {
        await sock.sendMessage(jid, {
          image: { url: imageUrl },
          caption,
        }, { quoted: msg });
        await react('✅');
      } else {
        // No media URL — just send what we have
        let out = `🔞 *Results for "${query}"*\n${'─'.repeat(24)}\n\n`;
        list.slice(0, 5).forEach((v, i) => {
          const t   = v?.title || v?.name || 'Untitled';
          const lnk = v?.url   || v?.link  || v?.video || '';
          out += `*${i + 1}.* ${t.slice(0, 80)}${lnk ? '\n🔗 ' + lnk : ''}\n\n`;
        });
        out += FOOTER;
        await reply(out);
        await react('✅');
      }
    } catch (e) {
      await react('❌');
      await reply(`❌ *Search failed*\n\n${e.message}\n\nTry different keywords.${FOOTER}`);
    }
  },
};
