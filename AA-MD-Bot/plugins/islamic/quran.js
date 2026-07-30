// AA MD Bot — Full Quran Plugin (FIXED + PLAYABLE AUDIO)
// API 1: Al Quran Cloud (api.alquran.cloud) — free, no key, stable & documented
//        Used for the actual ayah text (Arabic + English + Urdu).
// API 2: David Cyril Quran API (apis.davidcyriltech.my.id/quran) — free, no key
//        Used ONLY as a bonus enrichment: surah metadata (Arabic/English name,
//        type, ayah count), an Indonesian tafsir, and a recitation audio URL.
//        Confirmed response shape (tested live):
//        {
//          "success": true,
//          "surah": {
//            "number": 1,
//            "name": { "arabic": "...", "english": "..." },
//            "type": "Meccan",
//            "ayahCount": 7,
//            "tafsir": { "id": "..." },
//            "recitation": "http://download.quranicaudio.com/.../001.mp3"
//          }
//        }
//
// Commands:
//   .quran 1          → full Surah Al-Fatiha (text) + playable recitation audio
//   .quran 2 255      → single ayah (Ayatul Kursi)
//   .quran list       → list all 114 surahs
import axios from "axios";

const AQ = "https://api.alquran.cloud/v1/surah";
const EDITIONS = "quran-uthmani,en.sahih,ur.jalandhry";
const DC = "https://apis.davidcyriltech.my.id/quran";

// Fetch bonus metadata + tafsir + recitation audio URL for a surah.
// Never throws — returns null on any failure so it never blocks the main reply.
async function fetchTafsirAndAudio(surahNum) {
  try {
    const { data } = await axios.get(DC, {
      params: { surah: surahNum },
      timeout: 10000,
    });
    if (!data?.success || !data?.surah) return null;
    const s = data.surah;
    return {
      arabicName: s?.name?.arabic || null,
      englishName: s?.name?.english || null,
      type: s?.type || null,
      ayahCount: s?.ayahCount || null,
      tafsir: s?.tafsir?.id || null,
      recitation: s?.recitation || null,
    };
  } catch {
    return null;
  }
}

// Resolve whatever WhatsApp socket/client object the plugin runtime handed us.
// Different MD bot forks name this differently — try the common ones.
function resolveSocket(ctx) {
  return ctx.client || ctx.conn || ctx.sock || ctx.bot || null;
}

// Resolve the target chat JID from the message object, trying common shapes.
function resolveJid(ctx) {
  const m = ctx.m || ctx.msg || ctx.message;
  return ctx.chatId || m?.chat || m?.key?.remoteJid || m?.from || null;
}

// Send a real, playable audio message (not just a text link).
// Baileys-compatible sockets accept a remote URL directly as the audio
// source — the library downloads/streams it and fills in duration itself.
async function sendPlayableAudio(ctx, audioUrl, fileName) {
  const socket = resolveSocket(ctx);
  const jid = resolveJid(ctx);
  const quoted = ctx.m || ctx.msg || ctx.message || undefined;

  if (!socket || typeof socket.sendMessage !== "function") {
    throw new Error(
      "No WhatsApp socket found in plugin context (expected client/conn/sock with sendMessage). " +
        "Update resolveSocket() to match this bot framework.",
    );
  }
  if (!jid) {
    throw new Error(
      "No target chat JID found in plugin context (expected m.chat or m.key.remoteJid).",
    );
  }

  await socket.sendMessage(
    jid,
    {
      audio: { url: audioUrl },
      mimetype: "audio/mpeg",
      ptt: false,
      fileName,
    },
    quoted ? { quoted } : undefined,
  );
}

// Surah names for quick reference (index 0 = surah 1)
const SURAH_NAMES = [
  "Al-Fatiha",
  "Al-Baqarah",
  "Ali 'Imran",
  "An-Nisa",
  "Al-Ma'idah",
  "Al-An'am",
  "Al-A'raf",
  "Al-Anfal",
  "At-Tawbah",
  "Yunus",
  "Hud",
  "Yusuf",
  "Ar-Ra'd",
  "Ibrahim",
  "Al-Hijr",
  "An-Nahl",
  "Al-Isra",
  "Al-Kahf",
  "Maryam",
  "Ta-Ha",
  "Al-Anbiya",
  "Al-Hajj",
  "Al-Mu'minun",
  "An-Nur",
  "Al-Furqan",
  "Ash-Shu'ara",
  "An-Naml",
  "Al-Qasas",
  "Al-Ankabut",
  "Ar-Rum",
  "Luqman",
  "As-Sajdah",
  "Al-Ahzab",
  "Saba",
  "Fatir",
  "Ya-Sin",
  "As-Saffat",
  "Sad",
  "Az-Zumar",
  "Ghafir",
  "Fussilat",
  "Ash-Shura",
  "Az-Zukhruf",
  "Ad-Dukhan",
  "Al-Jathiyah",
  "Al-Ahqaf",
  "Muhammad",
  "Al-Fath",
  "Al-Hujurat",
  "Qaf",
  "Adh-Dhariyat",
  "At-Tur",
  "An-Najm",
  "Al-Qamar",
  "Ar-Rahman",
  "Al-Waqi'ah",
  "Al-Hadid",
  "Al-Mujadila",
  "Al-Hashr",
  "Al-Mumtahanah",
  "As-Saf",
  "Al-Jumu'ah",
  "Al-Munafiqun",
  "At-Taghabun",
  "At-Talaq",
  "At-Tahrim",
  "Al-Mulk",
  "Al-Qalam",
  "Al-Haqqah",
  "Al-Ma'arij",
  "Nuh",
  "Al-Jinn",
  "Al-Muzzammil",
  "Al-Muddaththir",
  "Al-Qiyamah",
  "Al-Insan",
  "Al-Mursalat",
  "An-Naba",
  "An-Nazi'at",
  "Abasa",
  "At-Takwir",
  "Al-Infitar",
  "Al-Mutaffifin",
  "Al-Inshiqaq",
  "Al-Buruj",
  "At-Tariq",
  "Al-A'la",
  "Al-Ghashiyah",
  "Al-Fajr",
  "Al-Balad",
  "Ash-Shams",
  "Al-Layl",
  "Ad-Dhuha",
  "Ash-Sharh",
  "At-Tin",
  "Al-Alaq",
  "Al-Qadr",
  "Al-Bayyinah",
  "Az-Zalzalah",
  "Al-Adiyat",
  "Al-Qari'ah",
  "At-Takathur",
  "Al-Asr",
  "Al-Humazah",
  "Al-Fil",
  "Quraysh",
  "Al-Ma'un",
  "Al-Kawthar",
  "Al-Kafirun",
  "An-Nasr",
  "Al-Masad",
  "Al-Ikhlas",
  "Al-Falaq",
  "An-Nas",
];

function surahLabel(n) {
  return `${n}. ${SURAH_NAMES[n - 1] || "Surah " + n}`;
}

export default {
  command: "quran",
  alias: ["surah", "ayah", "ayat", "quranverse"],
  description:
    "Read the complete Quran — by surah or ayah, with playable recitation audio",
  category: "islamic",

  async execute(ctx) {
    const { args, text, reply, react, prefix } = ctx;
    const input = (text || "").trim().toLowerCase();

    // .quran list → show all 114 surahs
    if (input === "list" || input === "surahs") {
      let out = `📖 *114 Surahs of the Holy Quran*\n${"─".repeat(28)}\n\n`;
      for (let i = 1; i <= 114; i++) {
        out += `*${i}.* ${SURAH_NAMES[i - 1]}\n`;
        if (i % 20 === 0 && i < 114) out += "\n";
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
          `• ${prefix}quran <surah>          → full surah + audio\n` +
          `• ${prefix}quran <surah> <ayah>   → single verse\n` +
          `• ${prefix}quran list             → all 114 surahs\n\n` +
          `*Examples:*\n` +
          `  ${prefix}quran 1       → Surah Al-Fatiha\n` +
          `  ${prefix}quran 36      → Surah Ya-Sin\n` +
          `  ${prefix}quran 2 255   → Ayatul Kursi\n\n` +
          `> 📖 *AA MD Bot*`,
      );
    }

    await react("📖");

    try {
      const { data } = await axios.get(`${AQ}/${num1}/editions/${EDITIONS}`, {
        timeout: 20000,
      });

      // Al Quran Cloud always returns { code, status, data: [ arabicEdition, englishEdition, urduEdition ] }
      if (
        data?.code !== 200 ||
        !Array.isArray(data?.data) ||
        data.data.length < 3
      ) {
        throw new Error(
          data?.data || data?.status || "Unexpected API response shape",
        );
      }

      const [arEd, enEd, urEd] = data.data;
      const arabicAyahs = arEd?.ayahs || [];
      const englishAyahs = enEd?.ayahs || [];
      const urduAyahs = urEd?.ayahs || [];

      if (!arabicAyahs.length)
        throw new Error("No ayahs returned for this surah");

      const arabicName = arEd?.name || "";

      // Single ayah mode (no full-surah recitation audio for this case,
      // since the enrichment API only provides per-surah recitation)
      if (num2) {
        const ar = arabicAyahs.find((a) => a.numberInSurah === num2);
        const en = englishAyahs.find((a) => a.numberInSurah === num2);
        const ur = urduAyahs.find((a) => a.numberInSurah === num2);

        if (!ar)
          throw new Error(
            `Ayah ${num2} not found in Surah ${num1} (max: ${arabicAyahs.length})`,
          );

        const ref = `(${num1}:${num2})`;

        let out =
          `📖 *Surah ${surahLabel(num1)} — Ayah ${num2}*\n` +
          `${"─".repeat(28)}\n\n`;
        out += `*Arabic:*\n${ar.text}\n\n`;
        if (en?.text) out += `*English:*\n${en.text}\n\n`;
        if (ur?.text) out += `*اردو:*\n${ur.text}\n\n`;
        out += `_${ref}_\n\n> 📖 *AA MD Bot*`;
        await react("✅");
        return reply(out);
      }

      // Full surah — cap at 20 ayahs per message to avoid length issues
      const MAX = 20;

      // Fetch bonus metadata/tafsir/recitation before building the message
      // so the ayah count and type can be shown alongside the ayah text.
      const bonus = await fetchTafsirAndAudio(num1);

      let out =
        `📖 *Surah ${surahLabel(num1)}*` +
        (arabicName ? `\n${arabicName}` : "") +
        "\n";
      if (bonus?.type || bonus?.ayahCount) {
        const parts = [];
        if (bonus.type) parts.push(bonus.type);
        if (bonus.ayahCount) parts.push(`${bonus.ayahCount} ayahs`);
        out += `_${parts.join(" • ")}_\n`;
      }
      out += `${"─".repeat(28)}\n\n`;

      const slice = arabicAyahs.slice(0, MAX);
      for (const a of slice) {
        const n = a.numberInSurah;
        const enA = englishAyahs.find((x) => x.numberInSurah === n);
        out += `*(${num1}:${n})*\n`;
        out += `${a.text}\n`;
        if (enA?.text) out += `_${enA.text}_\n`;
        out += "\n";
      }

      if (arabicAyahs.length > MAX) {
        out += `_… and ${arabicAyahs.length - MAX} more ayahs._\n`;
        out += `💡 Use ${prefix}quran ${num1} <ayah> to read a specific verse.\n`;
      }

      if (bonus?.recitation) {
        out += `\n🎧 *Recitation audio is being sent below…*\n`;
      }

      out += `\n> 📖 *AA MD Bot*`;

      // 1) Send the metadata/text message first
      await reply(out);

      // 2) Then send the actual playable audio message, if available
      if (bonus?.recitation) {
        try {
          await sendPlayableAudio(
            ctx,
            bonus.recitation,
            `Surah_${num1}_${SURAH_NAMES[num1 - 1]}.mp3`,
          );
          await react("✅");
        } catch (audioErr) {
          // Text reply already succeeded — only the audio step failed.
          await react("⚠️");
          await reply(
            `⚠️ Could not send playable audio (${audioErr.message}).\n` +
              `Recitation link: ${bonus.recitation}`,
          );
        }
      } else {
        await react("✅");
      }

      return;
    } catch (e) {
      await react("❌");
      const detail = e?.response?.status
        ? `HTTP ${e.response.status} — ${e.response.statusText || "request failed"}`
        : e.message || "Unknown error";
      reply(
        `❌ *Quran Fetch Failed*\n\n${detail}\n\nTry again later.\n\n> 📖 *AA MD Bot*`,
      );
    }
  },
};
