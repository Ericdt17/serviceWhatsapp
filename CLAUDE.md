# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **`wwebjs-bot/`** — WhatsApp bot (whatsapp-web.js) + optional legacy Express API
- **Core mode** (`USE_CORE_API=true`) — orders go to **backend_core** on a **separate VPS** (not local `deliveries` table)
- **Dashboard** — separate repo on Vercel (`VITE_API_BASE_URL` → core domain)

## Development Commands

```bash
cd wwebjs-bot
npm run dev          # Bot (src/index.js) with nodemon
npm run api:dev      # Legacy API only (src/api/server.js)
npm run test         # Jest unit tests (src/__tests__/unit/)
npm run test:watch   # Jest in watch mode
npm run test:coverage  # With coverage report
npm run migrate      # Legacy DB only; skip with SKIP_MIGRATIONS=true
```

Run a single test file:
```bash
npx jest src/__tests__/unit/parser.test.js
npx jest --testNamePattern "extractPhone"  # match by test name
```

Copy `wwebjs-bot/.envexample` → `.env` before starting.

## Architecture

### Message flow (core mode)

```
WhatsApp message → message / message_create events
  → messageIngress (dedup both events, 400ms window)
  → onMessage (messageHandler.js)
      ├─ handleStaffCommand (staffCommands.js) — #ping, #status, etc.
      ├─ #link → reply group ID for dashboard linking
      ├─ getClientByWhatsappGroup (coreApiClient.js) → keycloakId
      └─ handleDelivery (deliveryHandler.js)
           ├─ parseDeliveryMessage (parser.js) — strict regex parse
           ├─ [fail] looksLikeMalformed → extractDeliveryWithAI (aiDeliveryExtract.js)
           ├─ [fail] FORMAT_REMINDER_ENABLED → msg.reply()
           └─ saveDelivery → coreApiClient.createTransaction()
```

### Core API client (`src/services/coreApiClient.js`)

1. `POST {CORE_API_BASE_URL}/auth/login` → JWT (cached, refreshed 60s before expiry)
2. `GET /api/users/whatsapp/{groupId}` → resolve keycloakId
3. `GET /api/packages?userId={keycloakId}` → catalog (cached 5 min)
4. Catalog match via `src/lib/packageCatalogMatch.js` (exact → fuzzy → AI → pickup fallback)
5. `POST /api/transactions` (multipart/form-data) with `X-User-Id: keycloakId`

### Key lib modules (`src/lib/`)

| File | Purpose |
|------|---------|
| `messageIngress.js` | Deduplicates `message` + `message_create` events by id + fingerprint |
| `orderIdempotency.js` | File-backed dedup of submitted WA message IDs across PM2 restarts |
| `coreApiCircuitBreaker.js` | Opens after N consecutive core API 5xx (default: 5 failures, 15 min cooldown) |
| `failedOrderDeadLetter.js` | Writes failed orders to `failed-orders/` JSON for manual inspection/replay |
| `packageCatalogMatch.js` | Matches parsed item text against client catalog (stock vs pickup) |
| `waReconnect.js` | Exponential back-off reconnect; exits process on LOGOUT/UNPAIRED for PM2 restart |
| `botAlerts.js` | Discord/Slack webhook alerts for disconnect, auth failure, QR stale, heartbeat |
| `botHealthServer.js` | HTTP health endpoint (`/health`) for Uptime Kuma / watchdog cron |
| `botMetrics.js` | In-memory counters (ordersOk, ordersFailed, waReconnects, etc.) |
| `scheduledDeliveryDate.js` | Sets next-day delivery when order arrives after cutoff hour (default 18:00) |

### Test structure (`src/__tests__/`)

- **`unit/`** — Jest unit tests; run with `npm test`
- **`integration/`** — API route tests using supertest (same Jest run)
- **`db/`** — Real-DB integration tests; run with `jest --config jest.db.config.js`
- **`setEnv.js`** — Loaded before any module; sets `NODE_ENV=test` and `JWT_SECRET`

### whatsapp-web.js version pin

The package is pinned to commit `b0e8693` and uses WA Web HTML `2.2413.51-beta`. Do **not** update this pin — newer builds (2.3000+) fail to inject `Store`, so `ready` events and `#link` never fire.

## Core mode env vars

| Variable | Purpose |
|----------|---------|
| `USE_CORE_API` | `true` → backend_core mode |
| `SKIP_MIGRATIONS` | `true` recommended in core mode |
| `DATABASE_URL` | Optional in core mode; required for legacy bot or `api:dev` |
| `CORE_API_BASE_URL` | Gateway base URL (e.g. `https://livsighttest.didierdjakoua.site`) |
| `CORE_BOT_USERNAME` / `CORE_BOT_PASSWORD` | Bot login credentials (`whatsapp-bot` user) |
| `CLIENT_ID` | WhatsApp session isolation across environments |
| `AI_DELIVERY_FALLBACK_ENABLED` + `OPENAI_API_KEY` | OpenAI fallback when strict parse fails |
| `BOT_ALERT_WEBHOOK_URL` | Discord/Slack webhook for ops alerts |
| `BOT_HEALTH_PORT` / `BOT_HEALTH_BIND` | HTTP health server (default 3099 / 127.0.0.1) |
| `BOT_EXIT_ON_FATAL_DISCONNECT` | Exit on LOGOUT/UNPAIRED so PM2 restarts (default true) |
| `FORMAT_REMINDER_ENABLED` | Reply with format hint when message looks like a malformed delivery |

See `.envexample` for the full list including circuit breaker, idempotency file, and observability vars.

## Staging deploy

See [wwebjs-bot/docs/DEPLOY_STAGING.md](wwebjs-bot/docs/DEPLOY_STAGING.md).
Staff guide: [wwebjs-bot/docs/HOW_THE_BOT_WORKS.md](wwebjs-bot/docs/HOW_THE_BOT_WORKS.md).
Ops runbook: [wwebjs-bot/docs/OPS_RUNBOOK.md](wwebjs-bot/docs/OPS_RUNBOOK.md).

- Bot VPS: PM2 `whatsapp-bot-core` at `/opt/livsight-whatsapp-core`
- Core VPS: `https://livsighttest.didierdjakoua.site`
- CD: `.github/workflows/cd-bot-core.yml`

## Legacy API (optional)

`wwebjs-bot/src/api/server.js` — `/api/v1/*`, JWT cookies, agencies/groups/deliveries. Used when legacy stack runs on bot VPS alongside old `whatsapp-bot`. Not needed in core mode.

## Git commits (Conventional Commits)

When the user asks for a commit, follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Same rule as Cursor: `.cursor/rules/conventional-commits.mdc`.

```
<type>[optional scope]: <description>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`.  
Breaking: `type!:` and/or footer `BREAKING CHANGE: ...`.  
Imperative description, no trailing period. Only commit when asked.
