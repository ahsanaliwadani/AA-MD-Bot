---
name: DC AI & stalk endpoints
description: DavidCyrilTech API endpoints confirmed working from Replit IP, with exact param names and response shapes.
---

## Confirmed working DC AI text endpoints (use ?prompt=, returns {success, model, data})
- `/ai/gemini-3-pro?prompt=` → `{success, model:"google/gemini-3-pro-preview", data:"..."}`
- `/ai/gpt-5?prompt=` → `{success, model:"openai/gpt-5", data:"..."}`
- `/ai/grok-4.1-fast?prompt=` → `{success, model:"xai/grok-4.1-fast-non-reasoning", data:"..."}`

## Confirmed BROKEN DC AI endpoints
- `/ai/claude-fable-5?prompt=` → 400/500 (upstream fails)
- `/blackbox?q=` → 500 (unreliable)
- `/ai/gemini?q=`, `/ai/gpt4o?q=`, `/ai/claude?q=` etc. → 404 (wrong path or param)

## Confirmed working DC stalk/image endpoints
- `/stalk/wa?url=<whatsapp_channel_url>` → `{success, title, followers, followersCount, description, image}` — WhatsApp channel stalk
- `/stalk/twitter?username=`, `/stalk/youtube?username=`, `/stalk/pinterest?username=`, `/stalk/snapchat?username=` → working
- `/igstalk?username=` → working (NOT `/stalk/instagram` which is 404)
- `/flux?prompt=` → binary image directly
- `/animagine?prompt=` → `{success, cdn_url:"..."}` — anime image, can be slow/timeout

## DC image endpoints that DON'T work from Replit
- `/epicrealism`, `/fluxv2`, `/fluxpro` → timeout or 500

## DC news categories (confirmed working)
- `/news/tech`, `/news/sports`, `/news/world`, `/news/entertainment` → working
- `/news/science`, `/news/health`, `/news/business`, `/news/crypto`, `/news/gaming`, etc. → 404

**Why:** DC API selectively blocks IPs or rate-limits certain endpoints; working endpoints confirmed via live probe.

**How to apply:** Always probe DC endpoints before adding them to a plugin. Use `?prompt=` for AI models (NOT `?q=`). Use `?url=` for `/stalk/wa`. Check `data` field for AI responses.
