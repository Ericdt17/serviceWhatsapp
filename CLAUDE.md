# CLAUDE.md

Guidance for working in the **LivSight WhatsApp service** repository.

## Project Overview

- **`wwebjs-bot/`** — WhatsApp bot (whatsapp-web.js) + optional legacy Express API
- **Core mode** (`USE_CORE_API=true`) — orders go to **backend_core** on a **separate VPS** (not local `deliveries`)
- **Dashboard** — separate repo on Vercel (`VITE_API_BASE_URL` → core domain)

## Development Commands

```bash
cd wwebjs-bot
npm run dev          # Bot (src/index.js) with nodemon
npm run api:dev      # Legacy API only (src/api/server.js)
npm run test         # Jest
npm run migrate      # Legacy DB only; skip with SKIP_MIGRATIONS=true
```

Copy `wwebjs-bot/.envexample` → `.env`.

## Core API flow

1. `POST CORE_AUTH_URL` — bot user (`snake`) → JWT
2. `GET CORE_API_BASE_URL/api/users/whatsapp/{groupId}` — resolve client
3. `GET /api/packages` + catalog match → `POST /api/transactions` with `X-User-Id`

Key files: `src/services/coreApiClient.js`, `src/lib/packageCatalogMatch.js`, `src/handlers/messageHandler.js`, `src/handlers/deliveryHandler.js`.

## Staging deploy

See [wwebjs-bot/docs/DEPLOY_STAGING.md](wwebjs-bot/docs/DEPLOY_STAGING.md).

- Bot VPS: PM2 `whatsapp-bot-core` at `/opt/livsight-whatsapp-core`
- Core VPS: `https://livsighttest.didierdjakoua.site`
- CD: `.github/workflows/cd-bot-core.yml`

## Key env vars (core mode)

| Variable | Purpose |
|----------|---------|
| `USE_CORE_API` | `true` → backend_core |
| `SKIP_MIGRATIONS` | `true` on bot host with shared core DB |
| `CORE_AUTH_URL` | e.g. `https://livsighttest.didierdjakoua.site/auth/login` |
| `CORE_API_BASE_URL` | Same domain (or `:8085` fallback) |
| `CORE_BOT_USERNAME` / `CORE_BOT_PASSWORD` | Bot login (`snake`) |
| `CLIENT_ID` | WhatsApp session isolation |

## Legacy API (optional)

`wwebjs-bot/src/api/server.js` — `/api/v1/*`, JWT cookies, agencies/groups/deliveries. Used when legacy stack runs on bot VPS alongside old `whatsapp-bot`.
