# QR recovery — WhatsApp session LivSight bot

Runbook when the bot loses its WhatsApp session and orders stop flowing.

See also [DEPLOY_STAGING.md](./DEPLOY_STAGING.md) · [UPTIME_KUMA.md](./UPTIME_KUMA.md) · [PROD_ROADMAP.md](./PROD_ROADMAP.md)

---

## When you need to scan QR

| Signal | Meaning |
|--------|---------|
| Discord: `Session WhatsApp fermée (LOGOUT…). Rescanner le QR` | Device unlinked — **QR required** |
| Discord: `Échec connexion WhatsApp — rescanner le QR` | `auth_failure` event |
| `/health` returns `"ok": false`, `whatsappState` not `CONNECTED` | Bot not linked |
| Deploy smoke fails after PM2 restart (not just during QR window) | Session missing or invalid |

**Not QR:** Discord `Session API LivSight expirée` / `Reconnexion à l'API` — that is **Core API JWT**; the bot re-logins automatically. No QR scan needed.

---

## Steps on the VPS

```bash
ssh user@bot-vps
cd /opt/livsight-whatsapp-core/wwebjs-bot
pm2 logs whatsapp-bot-core --lines 100
```

1. Confirm logs show QR or `AUTHENTICATION` / waiting for scan.
2. **Option A:** Read QR in terminal logs.
3. **Option B:** Copy `qr-code.png` from the VPS and scan it (SFTP / `scp`).
4. On the **bot phone**: WhatsApp → Linked devices → Link a device → scan code.
5. Wait for `BOT IS READY` in logs.

Verify:

```bash
curl -s http://127.0.0.1:3099/health | jq
# expect "ok": true when WhatsApp + Core API are up
```

Discord should send `Bot en ligne — WhatsApp prêt.` or `Bot reconnecté — WhatsApp OK.`

---

## Restore session from backup (disk loss only)

Use when `.wwebjs_auth/` was deleted but the **phone still shows the device linked** (rare). After **LOGOUT** on the phone, backup restore will not work — scan QR instead.

```bash
cd /opt/livsight-whatsapp-core/wwebjs-bot
pm2 stop whatsapp-bot-core

# List backups (nightly cron — see DEPLOY_STAGING.md)
ls -lt ../backups/wa-session/

# Restore (replace archive name and CLIENT_ID)
export CLIENT_ID=livsight-bot-core-staging
tar -xzf ../backups/wa-session/wa-session-${CLIENT_ID}-YYYYMMDD-HHMM.tar.gz -C .wwebjs_auth/

pm2 start ecosystem.bot-core.config.js
bash scripts/verify-bot-health.sh
```

---

## Nightly backup (recommended)

On the bot VPS, add cron (adjust path):

```cron
0 3 * * * cd /opt/livsight-whatsapp-core/wwebjs-bot && bash scripts/backup-wa-session.sh >> logs/wa-backup.log 2>&1
```

Manual run:

```bash
cd /opt/livsight-whatsapp-core/wwebjs-bot
bash scripts/backup-wa-session.sh
```

---

## Reconnect behavior (Phase 2)

| Disconnect reason | Bot behavior |
|-------------------|--------------|
| `LOGOUT`, `UNPAIRED`, `UNPAIRED_IDLE` | No auto-reconnect loop — alert + wait for QR |
| Network / `NAVIGATION` / other | Exponential backoff reconnect (5s → 10s → … up to 5 min) |

Override fatal reasons: `BOT_WA_FATAL_DISCONNECT_REASONS=LOGOUT,UNPAIRED`

---

## Checklist after recovery

- [ ] `curl http://127.0.0.1:3099/health` → `"ok": true`
- [ ] Uptime Kuma green
- [ ] Test order in a linked WhatsApp group
- [ ] `pm2 logs` — no repeated reconnect errors

---

*Last updated: 2026-06-09*
