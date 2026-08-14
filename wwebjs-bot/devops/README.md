# LivSight WhatsApp bot — DevOps

Folder for **bot VPS** operations: health watchdog, crontab examples, and an index of every related file in the repo.

**Runtime:** `/opt/livsight-whatsapp-core` · PM2 `whatsapp-bot-core` · user **`deploy` only**  
**Health:** `http://127.0.0.1:3099/health`

| In this folder | Purpose |
|----------------|---------|
| [README.md](./README.md) | This index |
| [watchdog-bot-health.sh](./watchdog-bot-health.sh) | Cron: restart PM2 if WhatsApp not `CONNECTED` |
| [crontab.example](./crontab.example) | Crontab lines for `deploy` |

Compatibility: `scripts/watchdog-bot-health.sh` is a thin wrapper that calls this folder (old crontab paths still work).

Local dashboard/WhatsApp fixtures (not VPS): [../local-dev/](../local-dev/).

---

## Related files (elsewhere in repo)

### Docs (`wwebjs-bot/docs/`)

| File | Purpose |
|------|---------|
| [../docs/DEPLOY_STAGING.md](../docs/DEPLOY_STAGING.md) | Staging deploy, `.env`, secrets |
| [../docs/OPS_RUNBOOK.md](../docs/OPS_RUNBOOK.md) | Discord alerts → first actions |
| [../docs/QR_RECOVERY.md](../docs/QR_RECOVERY.md) | Rescan QR / restore session backup |
| [../docs/UPTIME_KUMA.md](../docs/UPTIME_KUMA.md) | Public health probe / Kuma |
| [../docs/PROD_ROADMAP.md](../docs/PROD_ROADMAP.md) | Prod hardening roadmap |
| [../docs/HOW_THE_BOT_WORKS.md](../docs/HOW_THE_BOT_WORKS.md) | Staff product guide |
| [../../PRODUCTION_DEPLOYMENT_CHECKLIST.md](../../PRODUCTION_DEPLOYMENT_CHECKLIST.md) | Prod checklist |
| [../../PRODUCTION_TROUBLESHOOTING.md](../../PRODUCTION_TROUBLESHOOTING.md) | Troubleshooting |
| [../../DOMAIN_AND_DEPLOYMENT_SETUP.md](../../DOMAIN_AND_DEPLOYMENT_SETUP.md) | Domains / TLS |

### Scripts (`wwebjs-bot/scripts/`)

| File | Purpose |
|------|---------|
| [../scripts/verify-bot-health.sh](../scripts/verify-bot-health.sh) | Post-deploy health smoke (CI) |
| [../scripts/backup-wa-session.sh](../scripts/backup-wa-session.sh) | Nightly LocalAuth session archive |
| [../scripts/logrotate-bot.conf](../scripts/logrotate-bot.conf) | → `/etc/logrotate.d/livsight-bot` |
| [../scripts/watchdog-bot-health.sh](../scripts/watchdog-bot-health.sh) | Wrapper → `devops/watchdog-bot-health.sh` |

### Process / CI

| File | Purpose |
|------|---------|
| [../ecosystem.bot-core.config.js](../ecosystem.bot-core.config.js) | PM2 `whatsapp-bot-core` |
| [../.envexample](../.envexample) | Env template |
| [../../.github/workflows/ci.yml](../../.github/workflows/ci.yml) | CI + auto deploy on `main` |
| [../../.github/workflows/cd-bot-core.yml](../../.github/workflows/cd-bot-core.yml) | Manual deploy |

### App code (ops-relevant)

| File | Purpose |
|------|---------|
| [../src/index.js](../src/index.js) | Bot entry, WA client |
| [../src/lib/waReconnect.js](../src/lib/waReconnect.js) | Recoverable vs fatal disconnect |
| [../src/lib/botHealthServer.js](../src/lib/botHealthServer.js) | `/health` HTTP |
| [../src/lib/botHealthStatus.js](../src/lib/botHealthStatus.js) | Health JSON |
| [../src/lib/botAlerts.js](../src/lib/botAlerts.js) | Discord alerts |

### Runtime on VPS (not in git)

| Path | Purpose |
|------|---------|
| `wwebjs-bot/.env` | Secrets |
| `wwebjs-bot/.wwebjs_auth/` | WhatsApp session |
| `wwebjs-bot/logs/` | PM2 + `watchdog.log` |
| `wwebjs-bot/logs/watchdog-failcount` | Unhealthy streak counter |
| `wwebjs-bot/failed-orders/` | Dead-letter orders |
| `wwebjs-bot/qr-code.png` | QR when unpaired |
| `../backups/wa-session/` | Session backup tarballs |

---

## Health watchdog

1. Cron every 5 min → curl `/health`
2. Healthy = HTTP 200 and `whatsappState === "CONNECTED"`
3. After **3** consecutive failures (~15 min) → `pm2 restart whatsapp-bot-core`
4. Does **not** delete `.wwebjs_auth` (plain restart often restores without QR)

| After restart | Action |
|---------------|--------|
| `CONNECTED` | Done |
| `UNPAIRED` / Discord “Rescanner le QR” | [QR_RECOVERY.md](../docs/QR_RECOVERY.md) |

**Env:** `BOT_HEALTH_LOCAL_URL`, `BOT_WATCHDOG_FAIL_THRESHOLD` (default 3), `PM2_APP_NAME`, `BOT_WATCHDOG_DRY_RUN=1` for dry-run.

Install crontab from [crontab.example](./crontab.example) as user `deploy`.

```bash
cd /opt/livsight-whatsapp-core/wwebjs-bot
curl -s http://127.0.0.1:3099/health
BOT_WATCHDOG_DRY_RUN=1 bash devops/watchdog-bot-health.sh
tail -50 logs/watchdog.log
```

---

## Quick ops

```bash
sudo -u deploy pm2 logs whatsapp-bot-core --lines 100
sudo -u deploy pm2 restart whatsapp-bot-core --update-env
bash scripts/verify-bot-health.sh
# DM bot: #ping / #status
```

Alerts: [OPS_RUNBOOK.md](../docs/OPS_RUNBOOK.md).
