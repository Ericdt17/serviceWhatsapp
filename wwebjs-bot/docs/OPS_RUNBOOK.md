# LivSight WhatsApp Bot — Ops runbook

Quick actions when Discord alerts fire. All alerts use prefix `[LivSight Bot]`.

**Quick checks (no SSH):**

- DM the bot phone: `#ping` or `#status` (direct message only — not in vendor groups)
- Uptime Kuma: `https://bot-health.livsight.com/health` or `curl http://127.0.0.1:3099/health` on VPS
- PM2: `pm2 logs whatsapp-bot-core --lines 100`

See also: [QR_RECOVERY.md](./QR_RECOVERY.md), [DEPLOY_STAGING.md](./DEPLOY_STAGING.md), [UPTIME_KUMA.md](./UPTIME_KUMA.md).

---

## WhatsApp session

| Alert | Meaning | First action |
|-------|---------|--------------|
| WhatsApp déconnecté. Reconnexion en cours... | Recoverable disconnect; bot will retry with backoff | Wait 2–5 min; check `#status`. If persists → SSH `pm2 logs whatsapp-bot-core` |
| WhatsApp toujours déconnecté (N min) | Still disconnected after reminder delay | SSH: check network, `pm2 restart whatsapp-bot-core`; see [QR_RECOVERY.md](./QR_RECOVERY.md) if LOGOUT |
| Session WhatsApp fermée (LOGOUT). Rescanner le QR | Fatal disconnect — session logged out | Follow [QR_RECOVERY.md](./QR_RECOVERY.md): restore session backup or scan new QR on VPS |
| Échec connexion WhatsApp — rescanner le QR | Auth failure during connect | Same as LOGOUT runbook |
| QR non scanné depuis N min | QR displayed but not scanned | SSH + scan QR (`pm2 logs` shows QR or `qr-code.png` in app dir) |
| WhatsApp non prêt depuis N min | Client state not CONNECTED | `pm2 restart whatsapp-bot-core`; check Chrome orphans: `pgrep -af chrome` |
| Bot reconnecté — WhatsApp OK | Recovery (informational) | No action |

---

## Core API (orders)

| Alert | Meaning | First action |
|-------|---------|--------------|
| Session API LivSight expirée. Commandes bloquées | JWT expired; bot re-logins automatically | Usually self-heals; if repeats → check `CORE_BOT_USERNAME` / `CORE_BOT_PASSWORD` in `.env` |
| Reconnexion à l'API LivSight... | Re-login in progress | Wait; watch for "reconnecté à l'API" |
| Bot reconnecté à l'API LivSight. Commandes OK | API auth recovered | No action |
| Échec connexion API LivSight. Vérifier identifiants bot | Re-login failed (401 persists) | Verify bot user on staging gateway; fix `.env` credentials; `pm2 restart whatsapp-bot-core` |
| API LivSight indisponible (erreurs serveur). Pause commandes ~N min | Circuit breaker open after repeated 5xx | Wait for cooldown (~15 min default); check gateway/backend health; failed orders → `failed-orders/` JSON |

---

## Orders and groups

| Alert | Meaning | First action |
|-------|---------|--------------|
| Commande non enregistrée — Tel … | Order save failed (API/validation) | Check `wwebjs-bot/failed-orders/` on VPS for JSON payload; replay manually on dashboard |
| Groupe non lié — envoyer #link | No client linked to WhatsApp group | Vendor sends `#link` in group; admin pastes group id on client profile in dashboard |
| Impossible d'identifier le client pour ce groupe | Lookup error (not 404) | Check gateway logs; verify bot JWT and `/api/users/whatsapp/{groupId}` |

---

## Informational

| Alert | Meaning | First action |
|-------|---------|--------------|
| Bot en ligne — WhatsApp prêt | Startup after deploy/restart | No action |
| Bot OK — WhatsApp et API connectés | Daily heartbeat (24h) | No action if `#status` shows OK |

---

## SSH cheat sheet (bot VPS)

```bash
cd /opt/livsight-whatsapp-core/wwebjs-bot
pm2 status
pm2 logs whatsapp-bot-core --lines 80
bash scripts/verify-bot-health.sh
ls -la failed-orders/
tail -20 logs/bot-core-out.log
```

Log rotation: install [scripts/logrotate-bot.conf](../scripts/logrotate-bot.conf) as `/etc/logrotate.d/livsight-bot` (see [DEPLOY_STAGING.md](./DEPLOY_STAGING.md)).

---

## Staff commands (DM only)

| Command | Reply |
|---------|--------|
| `#ping` | Pong + uptime |
| `#status` | WhatsApp, Core API, circuit breaker, order counters, CLIENT_ID |

These work only in a **direct message** to the bot — ignored in vendor groups.
