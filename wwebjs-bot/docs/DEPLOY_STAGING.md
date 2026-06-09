# Deploy core WhatsApp bot — staging

Two VPSes:

| VPS | Role |
|-----|------|
| **Bot VPS** | `whatsapp-bot-core` (this repo) — PM2, WhatsApp session |
| **Core VPS** | Auth + API — `https://staging-gateway.livsight.com` |

The bot only makes **outbound HTTPS** to the core VPS. It does not host auth or transactions. No `DATABASE_URL` is required on the bot VPS in core mode.

---

## 1. Bot `.env` on bot VPS

Path: `/opt/livsight-whatsapp-core/wwebjs-bot/.env` (never commit).

```env
NODE_ENV=production
USE_CORE_API=true
SKIP_MIGRATIONS=true

CORE_API_BASE_URL=https://staging-gateway.livsight.com

CORE_BOT_USERNAME=whatsapp-bot
CORE_BOT_PASSWORD=<staging password>

CORE_DEPARTURE_CITY=Douala
CORE_DEPARTURE_REGION=Littoral
CORE_DEPARTURE_STREET=Bonapriso Shop
CORE_DESTINATION_CITY=Douala
CORE_DESTINATION_REGION=Littoral
CORE_DESTINATION_STREET=N/A

CLIENT_ID=livsight-bot-core-staging

AI_DELIVERY_FALLBACK_ENABLED=true
OPENAI_API_KEY=<your OpenAI API key>

# Discord: Server Settings → Integrations → Webhooks → copy URL
BOT_ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
```

Dashboard (separate Vercel repo): `VITE_API_BASE_URL=https://staging-gateway.livsight.com`

---

## 2. One-time VPS setup (bot VPS)

```bash
sudo mkdir -p /opt/livsight-whatsapp-core
sudo chown -R $USER:$USER /opt/livsight-whatsapp-core
cd /opt/livsight-whatsapp-core
git clone https://github.com/livSight/serviceWhatsapp.git .
cd wwebjs-bot
cp .envexample .env   # edit with real secrets
npm install --omit=dev
mkdir -p logs
pm2 start ecosystem.bot-core.config.js
pm2 save
pm2 startup   # follow printed command
```

**Only one** WhatsApp PM2 process per phone. Use `CLIENT_ID=livsight-bot-core-staging` (separate session from any legacy bot). Stop legacy `whatsapp-bot` manually at cutover.

### GitHub Actions secrets (repo Settings → Secrets → Actions)

| Secret | Purpose |
|--------|---------|
| `VPS_HOST` | Bot VPS IP or hostname |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | Private SSH key (PEM) |
| `GH_USERNAME` | GitHub user for `git pull` on VPS |
| `GH_TOKEN` | PAT with `repo` read access to `livSight/serviceWhatsapp` |
| `BOT_HEALTH_PUBLIC_URL` | Optional: `https://bot-health.livsight.com/health` — public smoke after deploy |

Auto-deploy: `.github/workflows/ci.yml` job `deploy-bot` (runs after tests pass on `main`). Deploy runs `scripts/verify-bot-health.sh` on the VPS (local `/health` always; public URL if secret set).

Manual deploy: Actions → **CD Bot Core** → Run workflow (skips CI).

Optional env `BOT_CORE_DEPLOY_PATH`, default `/opt/livsight-whatsapp-core`.

---

## 3. Verify connectivity (from bot VPS)

Auth login (expect HTTP 200 and `accessToken`):

```bash
curl -s -X POST "https://staging-gateway.livsight.com/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"whatsapp-bot","password":"YOUR_PASSWORD"}'
```

Smoke script (set env vars first):

```bash
cd wwebjs-bot
CORE_API_BASE_URL=https://staging-gateway.livsight.com \
CORE_BOT_USERNAME=whatsapp-bot CORE_BOT_PASSWORD=... \
CORE_USER_ID=<client-keycloak-uuid> \
  node src/scripts/smoke-test-core-transaction.js
```

Verified externally (May 2026): HTTPS gateway returns JWT; `GET /api/users/whatsapp/{groupId}` works on same domain.

---

## 4. Pair WhatsApp (Cameroon dev — SSH)

```bash
pm2 logs whatsapp-bot-core --lines 80
```

Scan QR in logs or open `wwebjs-bot/qr-code.png` on the VPS. Confirm `BOT IS READY`.

Do not delete `.wwebjs_auth/session-livsight-bot-core-staging/`.

Full runbook: [QR_RECOVERY.md](./QR_RECOVERY.md).

### Session backup (nightly cron)

```bash
cd /opt/livsight-whatsapp-core/wwebjs-bot
bash scripts/backup-wa-session.sh
```

Cron example:

```cron
0 3 * * * cd /opt/livsight-whatsapp-core/wwebjs-bot && bash scripts/backup-wa-session.sh >> logs/wa-backup.log 2>&1
```

Archives: `../backups/wa-session/wa-session-{CLIENT_ID}-*.tar.gz` (keeps last 7 by default).

---

## 5. Uptime Kuma & domaine health

| Où | URL curl |
|----|----------|
| **Sur le VPS** | `curl -s http://127.0.0.1:3099/health \| jq` |
| **Public (après DNS + Nginx)** | `curl -s https://bot-health.livsight.com/health \| jq` |

DNS : enregistrement **A** `bot-health.livsight.com` → IP du bot VPS.  
Nginx : [deploy/nginx-bot-health.conf.example](../deploy/nginx-bot-health.conf.example)

Voir [UPTIME_KUMA.md](./UPTIME_KUMA.md).

---

## 6. E2E

1. Dashboard: link client — `#link` in group → paste `whatsapp_group_id`.
2. Send test message (e.g. phone / items / amount / quartier).
3. Logs: `Linked client keycloakId` → `TRANSACTION CORE API`.
4. Confirm transaction in staging app.

---

## 7. Cutover

```bash
pm2 stop whatsapp-bot   # legacy only when core bot is stable
```

---

## 8. Upgrading whatsapp-web.js / WA Web version

See also [PROD_ROADMAP.md](./PROD_ROADMAP.md).

Two **separate** pins — bumping one does not update the other:

| Pin | Where | Current (Phase 1) |
|-----|--------|-------------------|
| **Library** | `wwebjs-bot/package.json` → `whatsapp-web.js` | Commit `b0e869317f301f3bd20dea20cdcbb08e452d8f36` |
| **WA Web HTML** | `src/index.js` → `webVersionCache.remotePath` | `2.2413.51-beta` (wppconnect-team/wa-version) |

### Upgrade checklist

1. On a branch: bump wwebjs commit and/or `webVersionCache` URL on **staging** only.
2. Run `npm install` and `npm test` locally; push and let CI pass.
3. Deploy to staging VPS (`main` or manual CD).
4. Verify: `bash scripts/verify-bot-health.sh` (or curl `/health` — expect `"ok": true`).
5. Send a test order in a linked WhatsApp group.
6. Watch `pm2 logs whatsapp-bot-core` for 24h; then repeat for prod.

If WhatsApp Web breaks after a Meta update, try a newer HTML from [wa-version](https://github.com/wppconnect-team/wa-version) before bumping the whole library.

### Post-deploy health smoke (manual)

```bash
cd /opt/livsight-whatsapp-core/wwebjs-bot
export BOT_HEALTH_PUBLIC_URL=https://bot-health.livsight.com/health   # optional
bash scripts/verify-bot-health.sh
```

Fails with `"ok": false` if WhatsApp is disconnected or Core API auth is broken — expected after QR loss until rescanned.

### Phase 3 — failed orders (dead letter)

When order save fails (Core API 400/500, circuit open, etc.), the bot writes JSON under `wwebjs-bot/failed-orders/` on the VPS. Inspect files for `messageText`, `parsed`, and `error`; replay manually via dashboard or curl.

Idempotency: backend dedupes on `whatsapp_message_id`; bot also keeps `data/submitted-message-ids.json` across PM2 restarts.

Optional: `SEND_CONFIRMATIONS=true` in `.env` to reply in the group when an order is saved.
