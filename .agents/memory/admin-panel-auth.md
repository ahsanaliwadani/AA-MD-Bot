---
name: Admin Panel Auth
description: Dashboard is now a full password-gated admin SPA; how auth works and what endpoints were added.
---

# Admin Panel Auth

## The Rule
`dashboard.html` is now a full SPA admin panel. Login is required unless `ADMIN_PASSWORD` is not set (in which case the panel still shows the login screen but blocks entry — users must set the secret).

**Why:** Multiple numbers connected = sensitive. Panel shows phone numbers and allows disconnect.

## How Auth Works
- `ADMIN_PASSWORD` env var (set via Replit Secret or `.env`)
- Token = `HMAC-SHA256(SESSION_SECRET, ADMIN_PASSWORD)` — stateless, no session store needed
- Stored as `adminToken` HttpOnly cookie (1-day TTL)
- `_isAdmin(req)` helper used to guard all `/admin/*` routes

## Endpoints Added (index.js)
- `POST /auth/login` — verifies password, sets cookie
- `GET  /auth/check` — returns `{ok, passwordSet}`
- `GET  /auth/logout` — clears cookie
- `GET  /admin/sessions` — full session list WITH phone numbers (auth required)
- `GET  /admin/stats` — detailed stats incl. categories, RAM, uptime ms (auth required)
- `GET  /admin/settings` — bot settings object (auth required)
- `POST /admin/settings` — update settings (auth required)
- `DELETE /admin/session/:id` — disconnect a session (auth required)

## Dashboard Pages
- **Overview** — stats cards (connected, plugins, RAM, uptime), category pills, session cards
- **Sessions** — full grid of all sessions with real-time SSE updates, disconnect button per card
- **Settings** — toggles for autoRead, autoTyping, autoStatusView, autoStatusReact, antiSpam, maintenanceMode, welcomeMessage; prefix input; bot mode radio; statusEmoji
- **Add Number** — pairing code form (calls existing `/session/create`)

## How to Apply
User must add `ADMIN_PASSWORD=<their-password>` to Replit Secrets (or `.env` on Oracle). Without it, login always fails with "ADMIN_PASSWORD not set" error shown in the panel.
