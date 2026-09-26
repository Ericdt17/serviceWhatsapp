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
tail -50 logs/watchdog.log
crontab -l | grep watchdog
```

**Auto-restart:** cron runs [devops/watchdog-bot-health.sh](../devops/watchdog-bot-health.sh) every 5 minutes (user `deploy`). DevOps folder: [../devops/](../devops/).

Log rotation: install [scripts/logrotate-bot.conf](../scripts/logrotate-bot.conf) as `/etc/logrotate.d/livsight-bot` (see [DEPLOY_STAGING.md](./DEPLOY_STAGING.md)).

---

## Outbound WhatsApp (backend → bot)

Internal HTTP on the health server (`BOT_HEALTH_PORT`, default `3099`). Auth: header `X-Bot-Internal-Token` must match `BOT_INTERNAL_TOKEN`. Set `BOT_OUTBOUND_ENABLED=false` to disable.

| Endpoint | Purpose |
|----------|---------|
| `POST /internal/send-document` | PDF relevé to **group** `@g.us` (existing) |
| `POST /internal/send-document-dm` | PDF DM to **phone** (`@c.us` / LID) — e.g. HR payslips |
| `POST /internal/send-text-dm` | Text DM to **phone** — e.g. payslip download link |
| `POST /internal/send-text` | Plain text to **one** group (broadcast orchestration is on Spring) |
| `POST /internal/issue-reminders/send` | Issue reminder DM to assignee phone (`@c.us`) |
| `POST /internal/reorganize-delivery-message` | Réorganiser un message livraison collé (OpenAI, admin/agent) |

**Nginx (si `WHATSAPP_BOT_BASE_URL=https://bot-health.livsight.com`)** — ajouter le proxy pour **chaque** route `/internal/*` (voir [deploy/nginx-bot-health.conf.example](../deploy/nginx-bot-health.conf.example)). Sans cela, le core reçoit une **404 nginx** → dashboard : « Le bot a refusé la réorganisation du message ».

**Send text — success**

```bash
curl -sS -X POST "http://127.0.0.1:3099/internal/send-text" \
  -H "Content-Type: application/json" \
  -H "X-Bot-Internal-Token: $BOT_INTERNAL_TOKEN" \
  -d '{
    "whatsapp_group_id": "120363424985037911@g.us",
    "message": "Test LivSight — message texte OK"
  }'
```

Expect `200`: `{ "success": true, "sent": true, "whatsapp_group_id": "…@g.us", "message_id": "…" }`.

Optional: `"dry_run": true` validates only (no WhatsApp send); `message_id` is `null`.

**Body rules:** `whatsapp_group_id` must end with `@g.us`; `message` required, max **4000** characters.

**Send document DM (payslip / private PDF) — success**

```bash
curl -sS -X POST "http://127.0.0.1:3099/internal/send-document-dm" \
  -H "Content-Type: application/json" \
  -H "X-Bot-Internal-Token: $BOT_INTERNAL_TOKEN" \
  -d '{
    "recipient_phone": "693663641",
    "filename": "bulletin_paie.pdf",
    "pdf_base64": "<base64 PDF>",
    "caption": "Bulletin de paie — septembre 2026"
  }'
```

Expect `200`: `{ "success": true, "sent": true, "recipient": "237…@c.us", "filename": "…", "message_id": "…" }`.

**Body rules:** `recipient_phone` required (digits; local CM 9-digit mobiles get `237` prefix); `filename` must end with `.pdf`; `pdf_base64` required; `caption` optional, max **1024**.

**Errors (same style as send-document)**

| Status | When |
|--------|------|
| 401 | Missing/invalid `X-Bot-Internal-Token` |
| 400 | Validation (`validation_error`) |
| 503 | Bot not ready — `"WhatsApp client is not ready"` |
| 502 | WhatsApp send failed (`send_failed`) |

**Issue reminder DM — success**

Core schedules reminders and calls the bot with an assignee phone. The bot formats French copy and DMs `@c.us`. Scheduling / status re-check stay on Core.

```bash
curl -sS -X POST "http://127.0.0.1:3099/internal/issue-reminders/send" \
  -H "Content-Type: application/json" \
  -H "X-Bot-Internal-Token: $BOT_INTERNAL_TOKEN" \
  -d '{
    "issueId": 1,
    "type": "created",
    "recipientPhone": "+237690123456",
    "title": "Faire l inventaire du stock",
    "description": "Comptage entrepôt",
    "priority": "high",
    "dueDate": "2026-09-26T18:00:00+01:00",
    "assignedBy": "Eric",
    "idempotencyKey": "issue:1:created:v1"
  }'
```

Expect `200`: `{ "success": true, "sent": true, "issueId": 1, "type": "created", "recipient": "…@c.us", "message_id": "…" }`.

`type`: `created` | `reassigned` | `due_24h` | `due_3h` | `due_now` | `overdue_2h` | `overdue_repeat` | `resolved_review` | `report_rejected` | `closed`.  
`idempotencyKey` required — opaque string from Core (may include a datetime like `2026-09-26T15:30`); same key twice → `409` `{ "error": "duplicate" }`.  
`dueDate` optional ISO **offset datetime** (e.g. `2026-09-26T15:30:00+01:00`); DMs show full date + time in `TIME_ZONE`. Date-only legacy values may appear as `…T18:00`.  
`reason` required for `report_rejected` (admin rejection text).  
`resolved_review` → admins (title + person in charge); `report_rejected` / `closed` → assignee with title (agents may juggle several issues).  
Optional `"dry_run": true` validates/formats only. Description has no max from Core; WhatsApp display soft-truncates.

| Status | When |
|--------|------|
| 401 | Missing/invalid token |
| 400 | Validation |
| 409 | Duplicate `idempotencyKey` |
| 503 | Bot not ready |
| 502 | WhatsApp send failed |

```bash
# Empty message → 400
curl -sS -X POST "http://127.0.0.1:3099/internal/send-text" \
  -H "Content-Type: application/json" \
  -H "X-Bot-Internal-Token: $BOT_INTERNAL_TOKEN" \
  -d '{"whatsapp_group_id":"120363424985037911@g.us","message":"   "}'
```

**Reorganize delivery paste (IA) — success**

```bash
curl -sS -X POST "http://127.0.0.1:3099/internal/reorganize-delivery-message" \
  -H "Content-Type: application/json" \
  -H "X-Bot-Internal-Token: $BOT_INTERNAL_TOKEN" \
  -d '{"text":"675403331 bastos crème 9500"}'
```

Expect `200`: `{ "success": true, "reorganized_text": "…", "via_ai": true }`.

Via nginx public (après ajout de la location) :

```bash
curl -sS -X POST "https://bot-health.livsight.com/internal/reorganize-delivery-message" \
  -H "Content-Type: application/json" \
  -H "X-Bot-Internal-Token: $BOT_INTERNAL_TOKEN" \
  -d '{"text":"675403331 bastos crème 9500"}'
```

| Status | When |
|--------|------|
| 401 | Missing/invalid `X-Bot-Internal-Token` |
| 400 | Empty / invalid `text` |
| 422 | OpenAI could not extract phone or amount |
| 503 | `OPENAI_API_KEY` missing on bot |
| 404 (nginx HTML) | Location nginx manquante — voir exemple deploy |

---

## Staff commands (DM only)

| Command | Reply |
|---------|--------|
| `#ping` | Pong + uptime |
| `#status` | WhatsApp, Core API, circuit breaker, order counters, CLIENT_ID |

These work only in a **direct message** to the bot — ignored in vendor groups.
