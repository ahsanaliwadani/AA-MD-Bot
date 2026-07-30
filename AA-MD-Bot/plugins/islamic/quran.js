// AA MD Bot — Full Quran Plugin
// API: DavidCyrilTech /quran?surah=<1-114>
// Commands:
//   .quran 1          → full Surah Al-Fatiha
//   .quran 2 255      → single ayah (Ayatul Kursi)
//   .quran list       → list all 114 surahs
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Surah names for quick reference (index 0 = surah 1)
const SURAH_NAMES = [
  'Al-Fatiha','Al-Baqarah','Ali \'Imran','An-Nisa','Al-Ma\'idah','Al-An\'am','Al-A\'raf','Al-Anfal',
  'At-Tawbah','Yunus','Hud','Yusuf','Ar-Ra\'d','Ibrahim','Al-Hijr','An-Nahl','Al-Isra','Al-Kahf',
  'Maryam','Ta-Ha','Al-Anbiya','Al-Hajj','Al-Mu\'minun','An-Nur','Al-Furqan','Ash-Shu\'ara',
  'An-Naml','Al-Qasas','Al-Ankabut','Ar-Rum','Luqman','As-Sajdah','Al-Ahzab','Saba','Fatir',
  'Ya-Sin','As-Saffat','Sad','Az-Zumar','Ghafir','Fussilat','Ash-Shura','Az-Zukhruf','Ad-Dukhan',
  'Al-Jathiyah','Al-Ahqaf','Muhammad','Al-Fath','Al-Hujurat','Qaf','Adh-Dhariyat','At-Tur',
  'An-Najm','Al-Qamar','Ar-Rahman','Al-Waqi\'ah','Al-Hadid','Al-Mujadila','Al-Hashr','Al-Mumtahanah',
  'As-Saf','Al-Jumu\'ah','Al-Munafiqun','At-Taghabun','At-Talaq','At-Tahrim','Al-Mulk','Al-Qalam',
  'Al-Haqqah','Al-Ma\'arij','Nuh','Al-Jinn','Al-Muzzammil','Al-Muddaththir','Al-Qiyamah','Al-Insan',
  'Al-Mursalat','An-Naba','An-Nazi\'at','Abasa','At-Takwir','Al-Infitar','Al-Mutaffifin','Al-Inshiqaq',
  'Al-Buruj','At-Tariq','Al-A\'la','Al-Ghashiyah','Al-Fajr','Al-Balad','Ash-Shams','Al-Layl',
  'Ad-Dhuha','Ash-Sharh','At-Tin','Al-Alaq','Al-Qadr','Al-Bayyinah','Az-Zalzalah','Al-Adiyat',
  'Al-Qari\'ah','At-Takathur','Al-Asr','Al-Humazah','Al-Fil','Quraysh','Al-Ma\'un','Al-Kawthar',
  'Al-Kafirun','An-Nasr','Al-Masad','Al-Ikhlas','Al-Falaq','An-Nas',
];

function surahLabel(n) {
  return `${n}. ${SURAH_NAMES[n - 1] || 'Surah ' + n}`;
}

export default {
  command: 'quran',
  alias: ['surah', 'ayah', 'ayat', 'quranverse'],
  description: 'Read the complete Quran — by surah or ayah',
  category: 'islamic',

  async execute({ args, text, reply, react, prefix }) {
    const input = (text || '').trim().toLowerCase();

    // .quran list → show all 114 surahs
    if (input === 'list' || input === 'surahs') {
      let out = `📖 *114 Surahs of the Holy Quran*\n${'─'.repeat(28)}\n\n`;
      for (let i = 1; i <= 114; i++) {
        out += `*${i}.* ${SURAH_NAMES[i - 1]}\n`;
        if (i % 20 === 0 && i < 114) out += '\n';
      }
      out += `\n💡 *Usage:* ${prefix}quran <surah> [ayah]\n`;
      out += `_e.g. ${prefix}quran 1  or  ${prefix}quran 2 255_\n\n`;
      out += `> 📖 *AA MD Bot*`;
      return reply(out);
    }

    const num1 = parseInt(args[0]);
    const num2 = parseInt(args[1]);

    if (!num1 || num1 < 1 || num1 > 114) {
      return reply(
        `📖 *Quran Reader*\n\n` +
        `*Usage:*\n` +
        `• ${prefix}quran <surah>          → full surah\n` +
        `• ${prefix}quran <surah> <ayah>   → single verse\n` +
        `• ${prefix}quran list             → all 114 surahs\n\n` +
        `*Examples:*\n` +
        `  ${prefix}quran 1       → Surah Al-Fatiha\n` +
        `  ${prefix}quran 36      → Surah Ya-Sin\n` +
        `  ${prefix}quran 2 255   → Ayatul Kursi\n\n` +
        `> 📖 *AA MD Bot*`
      );
    }

    await react('📖');

    try {
      const { data } = await axios.get(`${DC}/quran`, {
        params: { surah: num1 },
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });

      if (!data?.success && !data?.surah && !data?.data && !data?.ayahs) {
        throw new Error(data?.error || data?.message || 'No data returned');
      }

      const d      = data?.data || data?.surah || data;
      const name   = d?.name   || d?.surahName   || d?.englishName || SURAH_NAMES[num1 - 1];
      const arabic = d?.arabicName || d?.arabic  || '';
      const ayahs  = d?.ayahs  || d?.verses       || d?.ayah || [];

      if (!ayahs.length) throw new Error('No ayahs in response');

      // Single ayah mode
      if (num2) {
        const ayah = ayahs.find(a => (a.ayahNumber || a.number || a.verseNumber) === num2) || ayahs[num2 - 1];
        if (!ayah) throw new Error(`Ayah ${num2} not found in Surah ${num1}`);

        const ar   = ayah.arabic  || ayah.text   || ayah.arabicText || '';
        const en   = ayah.english || ayah.translation || ayah.englishTranslation || '';
        const ur   = ayah.urdu   || ayah.urduTranslation || '';
        const ref  = `(${num1}:${num2})`;

        let out =
          `📖 *Surah ${surahLabel(num1)} — Ayah ${num2}*\n` +
          `${'─'.repeat(28)}\n\n`;
        if (ar) out += `*Arabic:*\n${ar}\n\n`;
        if (en) out += `*English:*\n${en}\n\n`;
        if (ur) out += `*اردو:*\n${ur}\n\n`;
        out += `_${ref}_\n\n> 📖 *AA MD Bot*`;
        await react('✅');
        return reply(out);
      }

      // Full surah — cap at 20 ayahs per message to avoid length issues
      const MAX = 20;
      let out =
        `📖 *Surah ${surahLabel(num1)}*` +
        (arabic ? `\n${arabic}` : '') + '\n' +
        `${'─'.repeat(28)}\n\n`;

      const slice = ayahs.slice(0, MAX);
      for (const a of slice) {
        const n  = a.ayahNumber || a.number || a.verseNumber || '';
        const ar = a.arabic  || a.text   || a.arabicText  || '';
        const en = a.english || a.translation || a.englishTranslation || '';
        out += `*(${num1}:${n})*\n`;
        if (ar) out += `${ar}\n`;
        if (en) out += `_${en}_\n`;
        out += '\n';
      }

      if (ayahs.length > MAX) {
        out += `_… and ${ayahs.length - MAX} more ayahs._\n`;
        out += `💡 Use ${prefix}quran ${num1} <ayah> to read a specific verse.\n`;
      }
      out += `\n> 📖 *AA MD Bot*`;

      await react('✅');
      return reply(out);
    } catch (e) {
      await react('❌');
      reply(`❌ *Quran Fetch Failed*\n\n${e.message}\n\nTry again later.\n\n> 📖 *AA MD Bot*`);
    }
  },
};
