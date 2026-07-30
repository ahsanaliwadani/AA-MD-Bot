// ============================================
// AA MD Bot - Website Screenshot
// Primary : api.siputzx.my.id (fast, full-page)
// Fallback : thum.io (free, no API key)
// ============================================

import axios from 'axios';

const DC      = 'https://apis.davidcyriltech.my.id/ssweb';
const SIPUTZX = 'https://api.siputzx.my.id/api/tools/ssweb';
const THUM    = 'https://image.thum.io/get/width/1280/crop/800/url';

export default {
  command: 'screenshot',
  alias: ['ss', 'ssweb', 'webss', 'snap', 'webshot', 'capture'],
  description: 'Take a screenshot of any website',
  category: 'search',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    if (!text) return reply(
      `📸 *Website Screenshot*\n\n` +
      `*Usage:* ${prefix}ss <url>\n\n` +
      `*Example:*\n` +
      `• ${prefix}ss https://google.com\n` +
      `• ${prefix}ss github.com\n\n` +
      `> 📸 *AA MD Bot*`
    );

    let url = text.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    await react('📸');

    try {
      let imgBuf = null;

      // ── Primary: siputzx (full-page, light theme, desktop) ──────────────────
      try {
        const { data } = await axios.get(SIPUTZX, {
          params: { url, theme: 'light', device: 'desktop' },
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: { accept: '*/*' },
        });
        const buf = Buffer.from(data);
        if (buf.length > 5000) imgBuf = buf;
      } catch {}

      // ── Fallback 1: DavidCyrilTech ssweb ─────────────────────────────────────
      if (!imgBuf) {
        try {
          const { data } = await axios.get(DC, {
            params: { url },
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          const buf = Buffer.from(data);
          if (buf.length > 5000) imgBuf = buf;
        } catch {}
      }

      // ── Fallback 2: thum.io ───────────────────────────────────────────────────
      if (!imgBuf) {
        const { data } = await axios.get(`${THUM}/${encodeURI(url)}`, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });
        const buf = Buffer.from(data);
        if (buf.length > 5000) imgBuf = buf;
      }

      if (!imgBuf) throw new Error('Both screenshot APIs returned empty response');

      await sock.sendMessage(jid, {
        image: imgBuf,
        caption:
          `📸 *Website Screenshot*\n\n` +
          `🌐 *URL:* ${url}\n\n` +
          `> 📸 *AA MD Bot*`,
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ Screenshot failed: ${e.message}\n\nMake sure the URL is correct and the site is accessible.`);
    }
  },
};
