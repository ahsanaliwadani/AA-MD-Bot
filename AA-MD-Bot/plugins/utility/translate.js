import axios from 'axios';

// Language code aliases — common shorthand → BCP-47
const LANG_ALIASES = {
  ur: 'ur', urdu: 'ur',
  en: 'en', english: 'en',
  ar: 'ar', arabic: 'ar',
  hi: 'hi', hindi: 'hi',
  zh: 'zh', chinese: 'zh',
  fr: 'fr', french: 'fr',
  es: 'es', spanish: 'es',
  de: 'de', german: 'de',
  ru: 'ru', russian: 'ru',
  tr: 'tr', turkish: 'tr',
  fa: 'fa', persian: 'fa',
  id: 'id', indonesian: 'id',
  ms: 'ms', malay: 'ms',
  pt: 'pt', portuguese: 'pt',
  ja: 'ja', japanese: 'ja',
  ko: 'ko', korean: 'ko',
};

const DC_TRANSLATE = 'https://apis.davidcyriltech.my.id/tools/translate';
const UA_TR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Primary: DavidCyrilTech translate API
async function dcTranslate(text, targetLang) {
  const res = await axios.get(DC_TRANSLATE, {
    params: { text, to: targetLang },
    headers: { 'User-Agent': UA_TR },
    timeout: 15000,
  });
  const d = res.data?.result || res.data?.data || res.data;
  const translated = d?.translated_text || d?.translation || d?.translatedText || d?.result || d?.text;
  const detectedSrc = res.data?.detected_language || d?.detected_language || d?.from || 'auto';
  if (!translated || translated === text) throw new Error('Empty');
  return { translated, detectedSrc };
}

// Fallback 1: Google Translate unofficial endpoint — auto-detects source language,
// no API key needed, supports 100+ languages.
async function googleTranslate(text, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await axios.get(url, { timeout: 15000 });
  // Response: [[["translated","original",...], ...], null, "detected_src_lang", ...]
  const parts = res.data?.[0];
  if (!Array.isArray(parts) || !parts.length) throw new Error('Empty');
  const translated = parts.map(p => p?.[0] || '').join('').trim();
  if (!translated) throw new Error('Empty translation');
  const detectedSrc = res.data?.[2] || 'auto';
  return { translated, detectedSrc };
}

// Fallback: MyMemory — uses autodetect source
async function myMemoryTranslate(text, targetLang) {
  const res = await axios.get(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${encodeURIComponent(targetLang)}`,
    { timeout: 15000 }
  );
  const translated = res.data?.responseData?.translatedText?.trim();
  if (!translated || translated === text) throw new Error('Same text / empty');
  return { translated, detectedSrc: 'auto' };
}

export default {
  command: 'translate',
  alias: ['tr', 'tl'],
  description: 'Translate text to any language (auto-detects source)',
  category: 'utility',

  async execute({ reply, args, text }) {
    if (!text) {
      return reply(
        `❌ *Usage:* .translate [lang] [text]\n\n` +
        `*Examples:*\n` +
        `• .translate ur Hello world\n` +
        `• .translate en یہ اردو میں ہے\n` +
        `• .translate ar Good morning\n\n` +
        `Source language is *auto-detected*.`
      );
    }

    const rawLang = args[0]?.toLowerCase() || 'en';
    const targetLang = LANG_ALIASES[rawLang] || rawLang;
    const toTranslate = args.slice(1).join(' ').trim();

    if (!toTranslate) {
      return reply('❌ Please provide text after the language code.\n\nExample: .translate ur Hello world');
    }

    try {
      let result = null;

      // Try DavidCyrilTech first, then Google, then MyMemory
      for (const fn of [
        () => dcTranslate(toTranslate, targetLang),
        () => googleTranslate(toTranslate, targetLang),
        () => myMemoryTranslate(toTranslate, targetLang),
      ]) {
        try { result = await fn(); if (result?.translated) break; } catch {}
      }

      if (!result?.translated) throw new Error('All sources failed');

      const srcLabel = result.detectedSrc && result.detectedSrc !== 'auto'
        ? ` _(${result.detectedSrc})_`
        : '';

      await reply(
        `🌐 *Translation*\n\n` +
        `📝 *Original${srcLabel}:*\n${toTranslate}\n\n` +
        `🔤 *Translated (${targetLang}):*\n${result.translated}`
      );

    } catch {
      await reply('❌ Translation failed. Please try again later.');
    }
  },
};
