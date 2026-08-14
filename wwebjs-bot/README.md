# LivSight WhatsApp bot (`wwebjs-bot`)

WhatsApp bot (whatsapp-web.js) for LivSight. **Recommended mode:** `USE_CORE_API=true` — orders go to **backend_core** on a separate VPS (no local `deliveries` DB required).

Optional: legacy Express API (`src/api/server.js`) for older dashboards / bot-VPS stacks.

Staff guide (formats, `#link`): [docs/HOW_THE_BOT_WORKS.md](docs/HOW_THE_BOT_WORKS.md).

---

## Modes

| Mode | When | Data |
|------|------|------|
| **Core** (`USE_CORE_API=true`) | Staging / prod bot VPS | HTTPS to `CORE_API_BASE_URL`; `SKIP_MIGRATIONS=true` |
| **Legacy** (`USE_CORE_API=false`) | Local legacy / old API | `DATABASE_URL` + migrations; Express `/api/v1/*` |

---

## Quickstart (core — local)

```bash
cp .envexample .env
# Set at least:
#   USE_CORE_API=true
#   SKIP_MIGRATIONS=true
#   CORE_API_BASE_URL=...
#   CORE_BOT_USERNAME / CORE_BOT_PASSWORD
#   CLIENT_ID=livsight-bot-local   # unique per machine / env

npm install
npm run dev    # bot: src/index.js (nodemon)
npm test       # Jest
```

| Script | Purpose |
|--------|---------|
| `npm run dev` | Bot only (`src/index.js`) |
| `npm run api:dev` | Legacy Express API only |
| `npm run migrate` | Legacy DB migrations (skip in core mode) |
| `npm run seed:local-tx` | Create 5 **stock** + 5 **pickup** txs for today — see [local-dev/](local-dev/) |
| `npm start` | Production bot entry |

---

## Layout

```
src/
├── index.js                 # WhatsApp client, ingress dedupe, health
├── handlers/                # message / delivery / staff (#ping, #status)
├── services/coreApiClient.js
├── lib/                     # catalog match, scheduled date, ingress, alerts…
├── parser.js / statusParser.js
└── api/                     # Legacy Express (optional)
docs/
├── HOW_THE_BOT_WORKS.md
├── DEPLOY_STAGING.md
└── OPS_RUNBOOK.md
```

PM2 (core staging/prod): **`whatsapp-bot-core`** via `ecosystem.bot-core.config.js`  
(Legacy: separate `whatsapp-bot` + `api-server` — avoid running both against the same phone.)

---

## Core API flow

1. `POST {CORE_API_BASE_URL}/auth/login` — bot JWT  
2. `GET /api/users/whatsapp/{groupId}` — resolve linked client  
3. `GET /api/packages` + catalog match → `POST /api/transactions` (`X-User-Id`, `scheduled_delivery_date`, optional multi-SKU `items[]`)

Key files: `src/services/coreApiClient.js`, `src/lib/packageCatalogMatch.js`, `src/lib/scheduledDeliveryDate.js`, `src/handlers/deliveryHandler.js`.

---

## Env (core essentials)

Copy [.envexample](.envexample). Important variables:

| Variable | Purpose |
|----------|---------|
| `USE_CORE_API` | `true` for backend_core |
| `SKIP_MIGRATIONS` | `true` on core bot host |
| `CORE_API_BASE_URL` | Gateway (auth + API) |
| `CORE_BOT_USERNAME` / `CORE_BOT_PASSWORD` | Bot service account |
| `CLIENT_ID` | Session folder isolation (never share across envs) |
| `GROUP_ID` | Optional: only process one group |
| `SCHEDULED_DELIVERY_CUTOFF_HOUR` | Default `18` (Africa/Douala) → next-day date after cutoff |
| `BOT_HEALTH_PORT` / `BOT_HEALTH_BIND` | Default `3099` / `127.0.0.1` |
| `BOT_ALERT_WEBHOOK_URL` | Discord ops alerts |
| `AI_DELIVERY_FALLBACK_ENABLED` / `OPENAI_API_KEY` | Messy-line parse fallback |
| `PUPPETEER_EXECUTABLE_PATH` | System Chrome on VPS if bundled Chromium missing |

---

## Staff / ops commands

| Where | Command | Effect |
|-------|---------|--------|
| **DM** to bot | `#ping` | Liveness |
| **DM** to bot | `#status` | WhatsApp + Core API + circuit / metrics |
| **Group** | `#link` | Reply with WhatsApp group id (paste on client profile in dashboard) |

Order message formats: [docs/HOW_THE_BOT_WORKS.md](docs/HOW_THE_BOT_WORKS.md) §5.

---

## Staging deploy

See [docs/DEPLOY_STAGING.md](docs/DEPLOY_STAGING.md).

- Path: `/opt/livsight-whatsapp-core`
- Process: `whatsapp-bot-core` (run/manage as **deploy** user — one instance only)
- CD: push to `main` → CI `deploy-bot`; or manual **CD Bot Core** workflow

**DevOps** (crons, watchdog, file index): [devops/](devops/)  
**Local fixtures** (seed txs, catalog, WhatsApp test messages): [local-dev/](local-dev/)  
Ops alerts: [docs/OPS_RUNBOOK.md](docs/OPS_RUNBOOK.md) · QR: [docs/QR_RECOVERY.md](docs/QR_RECOVERY.md).

---

## Legacy API (optional)

`src/api/server.js` — `/api/v1/*` (auth, agencies, groups, deliveries). Needs `DATABASE_URL` and migrations.

Contract: [../API.md](../API.md). Local Postgres example: `env.local.postgres.example`.

```bash
npm run api:dev
npm run migrate
```

---

## Tests

```bash
npm test                 # unit / integration Jest
npm run test:db:integration   # Postgres smoke (CI)
```
