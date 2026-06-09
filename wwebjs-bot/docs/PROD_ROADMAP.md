# LivSight WhatsApp Bot — Production Roadmap (phased)

Phased plan to make the bot more powerful and robust for production.  
Complete each phase before moving to the next.

**Stack:** whatsapp-web.js + Puppeteer · Core API (`USE_CORE_API=true`) · PM2 · Discord alerts · Uptime Kuma

**References:**
- [DEPLOY_STAGING.md](./DEPLOY_STAGING.md)
- [UPTIME_KUMA.md](./UPTIME_KUMA.md)
- [HOW_THE_BOT_WORKS.md](./HOW_THE_BOT_WORKS.md)
- [whatsapp-web.js guide](https://wwebjs.dev/guide)

---

## Current baseline (already in place)

- [x] `LocalAuth` + `CLIENT_ID` session isolation
- [x] Puppeteer server flags (`--no-sandbox`, etc.)
- [x] Pinned `webVersionCache` (wa-version remote HTML)
- [x] `restartOnAuthFail: true`
- [x] Auto-reconnect on `disconnected`
- [x] Short French Discord alerts + daily heartbeat
- [x] `/health` (WhatsApp + Core API auth) + Uptime Kuma
- [x] Core API JWT auto re-login on 401
- [x] CI: Jest + Postgres integration + deploy on `main`

---

## Phase 1 — Stability and deploy safety

**Goal:** Stop surprise breakages on deploy and recover cleanly from PM2 restarts.

| # | Task | Status |
|---|------|--------|
| 1.1 | Pin `whatsapp-web.js` to commit (not `#main`) | Done in repo |
| 1.2 | Document upgrade procedure (wwebjs + `webVersionCache`) | See [DEPLOY_STAGING.md](./DEPLOY_STAGING.md) |
| 1.3 | Graceful shutdown (`SIGTERM`/`SIGINT` → `client.destroy()`) | Done in repo |
| 1.4 | PM2 hardening (`min_uptime`, `kill_timeout`, etc.) | Done in repo |
| 1.5 | Post-deploy health smoke in CI/CD | Done in repo |
| 1.6 | VPS `.env` verification (manual) | See checklist below |

### Pinned versions (Phase 1)

| Component | Pin |
|-----------|-----|
| whatsapp-web.js | `b0e869317f301f3bd20dea20cdcbb08e452d8f36` |
| WA Web HTML (`webVersionCache`) | `2.2413.51-beta` (see `src/index.js`) |

### VPS `.env` checklist (manual — task 1.6)

Verify on `/opt/livsight-whatsapp-core/wwebjs-bot/.env`:

- [ ] `USE_CORE_API=true`
- [ ] `SKIP_MIGRATIONS=true`
- [ ] `CORE_API_BASE_URL` (staging gateway URL)
- [ ] `CORE_BOT_USERNAME` / `CORE_BOT_PASSWORD`
- [ ] `CLIENT_ID` (unique per environment — never share staging/prod)
- [ ] `BOT_ALERT_WEBHOOK_URL`
- [ ] `BOT_HEALTH_PORT=3099`
- [ ] `BOT_HEALTH_BIND=127.0.0.1`

**GitHub secret (optional):** `BOT_HEALTH_PUBLIC_URL=https://bot-health.livsight.com/health` for public smoke after deploy.

### Phase 1 exit criteria

- [ ] `npm test` passes locally and in CI
- [ ] `pm2 restart whatsapp-bot-core` — no orphan Chrome (`pgrep -af chrome`)
- [ ] Deploy smoke passes: `bash wwebjs-bot/scripts/verify-bot-health.sh` on VPS
- [ ] VPS `.env` checklist completed on staging

---

## Phase 2 — Session and reconnect resilience

**Goal:** Survive disconnects and disk issues without long outages.

| # | Task |
|---|------|
| 2.1 | Nightly backup of `.wwebjs_auth/session-{CLIENT_ID}/` |
| 2.2 | QR recovery runbook |
| 2.3 | Exponential backoff on reconnect |
| 2.4 | Treat `LOGOUT` disconnect: stop loop, alert rescan QR |
| 2.5 | Optional: `RemoteAuth` + S3 |

---

## Phase 3 — Order reliability and Core API

**Goal:** No duplicate orders, fewer silent failures.

| # | Task |
|---|------|
| 3.1 | Idempotency on `whatsapp_message_id` (core mode) |
| 3.2 | Backend unique constraint on message ID |
| 3.3 | Circuit breaker on Core API 5xx |
| 3.4 | Failed-order dead letter queue |
| 3.5 | Optional: `SEND_CONFIRMATIONS=true` |

---

## Phase 4 — Observability and ops

| # | Task |
|---|------|
| 4.1 | Structured logging (`pino`) in production |
| 4.2 | Log rotation on VPS |
| 4.3 | Metrics (orders ok/fail, API 401, reconnects) |
| 4.4 | Staff commands: `#status`, `#ping` |
| 4.5 | Alert → action runbook |

---

## Phase 5 — Testing and staging discipline

| # | Task |
|---|------|
| 5.1 | Staging soak (48h) |
| 5.2 | E2E script against staging gateway |
| 5.3 | Tests for `messageHandler` / `deliveryHandler` |
| 5.4 | Documented wwebjs upgrade checklist |

---

## Phase 6 — Long-term / scale

| # | Task |
|---|------|
| 6.1 | Evaluate Meta WhatsApp Business Cloud API |
| 6.2 | Dedicated prod phone + `CLIENT_ID` |
| 6.3 | OpenAI fallback rate limits |
| 6.4 | Multi-VPS HA (optional) |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| WhatsApp blocks unofficial client | Phase 6 (Cloud API) |
| WA Web UI change breaks bot | Phase 1 pins + upgrade procedure |
| Session lost on disk failure | Phase 2 backup |
| Duplicate orders | Phase 3 idempotency |
| Silent deploy failure | Phase 1 deploy smoke |

---

*Last updated: 2026-06-08*
