#!/usr/bin/env bash
# Restart whatsapp-bot-core when WhatsApp health stays bad.
# Does NOT delete .wwebjs_auth — a plain restart often restores the session.
#
# Cron (as deploy user on bot VPS) — see crontab.example in this folder:
#   */5 * * * * cd /opt/livsight-whatsapp-core/wwebjs-bot && bash devops/watchdog-bot-health.sh >> logs/watchdog.log 2>&1
#
# See: devops/README.md · docs/OPS_RUNBOOK.md · docs/DEPLOY_STAGING.md

set -u

HEALTH_URL="${BOT_HEALTH_LOCAL_URL:-http://127.0.0.1:3099/health}"
FAIL_THRESHOLD="${BOT_WATCHDOG_FAIL_THRESHOLD:-3}"
PM2_APP="${PM2_APP_NAME:-whatsapp-bot-core}"
STATE_DIR="${BOT_WATCHDOG_STATE_DIR:-logs}"
FAIL_FILE="${STATE_DIR}/watchdog-failcount"
DRY_RUN="${BOT_WATCHDOG_DRY_RUN:-0}"

mkdir -p "$STATE_DIR"

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"
}

read_failcount() {
  if [ -f "$FAIL_FILE" ]; then
    cat "$FAIL_FILE" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

write_failcount() {
  echo "$1" > "$FAIL_FILE"
}

reset_failcount() {
  write_failcount 0
}

# Prints whatsappState or empty.
get_whatsapp_state() {
  local body="$1"
  if command -v jq >/dev/null 2>&1; then
    echo "$body" | jq -r '.whatsappState // empty' 2>/dev/null || true
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    echo "$body" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  print(d.get("whatsappState") or "")
except Exception:
  print("")' 2>/dev/null || true
    return
  fi
  echo "$body" | sed -n 's/.*"whatsappState"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

HTTP_CODE="000"
BODY=""
TMP="$(mktemp)"
HTTP_CODE="$(curl -sS -m 10 -o "$TMP" -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")"
BODY="$(cat "$TMP" 2>/dev/null || true)"
rm -f "$TMP"

WA_STATE="$(get_whatsapp_state "$BODY")"
HEALTHY=0

if [ "$HTTP_CODE" = "200" ] && [ "$WA_STATE" = "CONNECTED" ]; then
  HEALTHY=1
fi

if [ "$HEALTHY" -eq 1 ]; then
  PREV="$(read_failcount | tr -cd '0-9')"
  PREV="${PREV:-0}"
  if [ "$PREV" != "0" ]; then
    log "OK whatsappState=CONNECTED (was failing x${PREV}) — reset counter"
  fi
  reset_failcount
  exit 0
fi

COUNT="$(read_failcount | tr -cd '0-9')"
COUNT="${COUNT:-0}"
COUNT=$((COUNT + 1))
write_failcount "$COUNT"

log "UNHEALTHY http=${HTTP_CODE} whatsappState=${WA_STATE:-empty} fail=${COUNT}/${FAIL_THRESHOLD}"
log "body=$(echo "$BODY" | tr '\n' ' ' | head -c 300)"

if [ "$COUNT" -lt "$FAIL_THRESHOLD" ]; then
  log "Below threshold — no restart yet"
  exit 0
fi

log "Threshold reached — restarting ${PM2_APP}"
reset_failcount

if [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN=1 — would run: pm2 restart ${PM2_APP}"
  exit 0
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "ERROR: pm2 not found in PATH"
  exit 1
fi

pm2 restart "$PM2_APP"
RC=$?
if [ "$RC" -eq 0 ]; then
  log "pm2 restart ${PM2_APP} OK"
else
  log "ERROR: pm2 restart failed rc=${RC}"
fi
exit "$RC"
