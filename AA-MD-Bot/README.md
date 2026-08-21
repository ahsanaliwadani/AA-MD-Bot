# AA MD Bot

<p align="center">
  <img src="banner.webp" alt="AA MD Bot" width="600"/>
</p>

<p align="center">
  <b>Multi-Device WhatsApp Bot — 226+ Plugins | Multi-Session | Oracle Cloud</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Platform-WhatsApp-25D366?logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/DB-MongoDB-47A248?logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Deploy-Oracle_Cloud_Free-F80000?logo=oracle&logoColor=white" />
</p>

---

## ⚡ Deploy — Sirf Ek Command

Oracle Cloud VM par SSH ke baad:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ahsanaliwadani/AA-MD-Bot/main/deploy/setup.sh)
```

**Koi input nahi — sab apne aap hota hai:**

| Step | Kya hota hai |
|---|---|
| MongoDB 7 | Same VM par install + start |
| DB User | `aa_bot_user` auto-create, random password |
| Node.js 20 | Install |
| yt-dlp + Deno | Install |
| PM2 | Install + auto-restart on reboot |
| Repo | Clone + `npm install` |
| `.env` | `MONGODB_URI` + `SESSION_SECRET` auto-write |
| Firewall | SSH + port 5000 open |
| Bot | Start |

Script khatam hone par:
```
✅  Deploy Complete!
Dashboard  : http://YOUR_IP:5000
MongoDB URI: mongodb://aa_bot_user:xxxxx@127.0.0.1:27017/aa_md_bot
```

---

## 🌐 WhatsApp Pair Karna

1. Browser mein kholo: `http://YOUR_VM_IP:5000`
2. WhatsApp number enter karo (country code ke saath, e.g. `923316041183`)
3. **Get Pairing Code** click karo
4. WhatsApp → **Settings → Linked Devices → Link a Device → Link with phone number**
5. 8-digit code enter karo — ho gaya ✅

---

## 🏗 3 VM Architecture (Oracle Always Free)

```
VM1 (2 OCPU, 12 GB) — Bot + MongoDB server
VM2 (1 OCPU,  6 GB) — Bot  ──┐
VM3 (1 OCPU,  6 GB) — Bot  ──┴── VM1 ke MongoDB se connect
```

VM1 par setup ke baad VM2/VM3 par bhi same command chalao — sirf `.env` mein `MONGODB_URI` ka IP change karo VM1 ka private IP daal kar.

**Full 3-VM guide:** [`deploy/ORACLE-DEPLOY.md`](deploy/ORACLE-DEPLOY.md)

---

## ✨ Features

| Category | Plugins |
|---|---|
| 📥 Downloads | YouTube, Instagram, TikTok, Twitter, Spotify, Reddit, Pinterest, Threads |
| 🔍 Search | Google, YouTube, Wikipedia, News, Anime, Lyrics, Stickers |
| 🎵 Media | Audio convert, video convert, compress, watermark, sticker maker |
| 👥 Groups | Anti-spam, anti-call, anti-delete, welcome/goodbye, poll, tagall |
| 🛠 Tools | Calculator, currency, weather, OCR, AI chat, translator |
| 🕌 Islamic | Prayer times, Quran, Hadith, Dua, Hijri calendar |
| ⚙️ Admin | Ban, mute, kick, promote, broadcast, session manage |
| 🤖 Telegram | Mirror bot — download & search commands via Telegram |

---

## ⚙️ Optional Settings

Deploy ke baad Telegram tokens ya API keys add karne hon to:

```bash
nano /home/ubuntu/AA-MD-Bot-repo/AA-MD-Bot/.env
# uncomment karo jo chahiye
pm2 restart aa-md-bot
```

| Variable | Kya karta hai |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Admin/pairing Telegram bot |
| `TELEGRAM_FEATURES_BOT_TOKEN` | Features mirror bot |
| `OPENWEATHER_API_KEY` | `.weather` command |
| `OMDB_API_KEY` | `.movie` command |
| `OCR_SPACE_KEY` | `.ocr` command |
| `HF_TOKEN` | AI commands |

### Access Key API

Access keys generated through the secure endpoints and the dashboard use the
same MongoDB `accessKeys` collection. They therefore appear in the dashboard
immediately, and deleting a key removes its database document and any linked
authorizations. Set `ACCESS_KEY_ENDPOINT_SECRET` before using these endpoints.

#### Lifetime keys and Access Key sheet

Omit both `expiresAt` and `expiresInDays` to generate a **lifetime** key. Every
generate, verification, assignment, status change, and delete is mirrored to
the `Access Keys` tab in the configured Google Sheet. The row headings are
`Access Key ID`, `Access Key`, `WhatsApp Number`, `Status`, `Type`, timestamps,
creator, connection ID, and last event; deleted keys stay in the sheet with
`Status = deleted` for audit history.

1. Create a Google Cloud service account, enable the Google Sheets API, and
   share the supplied spreadsheet with the service account's `client_email` as
   an **Editor**. An edit-link alone does not give a server/API caller a Google
   identity.
2. Set `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` to the complete one-line service
   account JSON (or set its base64 form in
   `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64`).
3. Optionally set `ACCESS_KEY_SHEET_ID`; when omitted, the supplied Access Key
   sheet is used.

> `GOOGLE_SHEETS_API_KEY` is supported as a configuration diagnostic only. A
> Google API key can access public read endpoints, but cannot create, update,
> or delete Google Sheet rows. Keep the API key in an environment secret and
> use the service-account credentials above for Access Key sheet writes.

```bash
# Generate a lifetime key (no expiry fields)
curl -X POST http://localhost:5000/access-keys/generate \
  -H 'Content-Type: application/json' \
  -H 'X-Access-Key-Secret: YOUR_SECRET' \
  -d '{"phone":"923001234567"}'

# List keys (the same records shown in the dashboard)
curl 'http://localhost:5000/access-keys' \
  -H 'X-Access-Key-Secret: YOUR_SECRET'

# Delete a key by its returned record.id
curl -X POST http://localhost:5000/access-keys/action \
  -H 'Content-Type: application/json' \
  -H 'X-Access-Key-Secret: YOUR_SECRET' \
  -d '{"action":"delete","id":"ACCESS_KEY_ID"}'
```

---

## 🔧 PM2 Commands

```bash
pm2 status                    # bot status
pm2 logs aa-md-bot            # live logs
pm2 logs aa-md-bot --err      # sirf errors
pm2 restart aa-md-bot         # restart
pm2 monit                     # CPU/RAM monitor
```

## 🔄 Update Karna

```bash
cd /home/ubuntu/AA-MD-Bot-repo
git pull
cd AA-MD-Bot
npm install --omit=dev
pm2 restart aa-md-bot
```

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard nahi khulta | `pm2 logs aa-md-bot --err` |
| `MongoDB connection failed` | `sudo systemctl restart mongod` |
| Port 5000 reachable nahi | Oracle Console → VCN → Security List → port 5000 add karo |
| YouTube bot-check error | `cookies.txt` file banao — `cookies.txt.example` dekho |
| Bot disconnect hota hai | Normal — PM2 auto-reconnect karta hai |

---

## Stack

[Baileys](https://github.com/WhiskeySockets/Baileys) · [MongoDB](https://www.mongodb.com/) · [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [ffmpeg](https://ffmpeg.org/) · [PM2](https://pm2.keymetrics.io/)

**Developer:** Ahsan Ali Wadani — AA Mods
