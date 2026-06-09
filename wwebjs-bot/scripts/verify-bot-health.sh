#!/usr/bin/env bash
# Post-deploy smoke: wait for bot /health to return HTTP 200 and ok:true.
# Run on the bot VPS after pm2 restart (CI/CD or manual).

set -euo pipefail

LOCAL_URL="${BOT_HEALTH_LOCAL_URL:-http://127.0.0.1:3099/health}"
PUBLIC_URL="${BOT_HEALTH_PUBLIC_URL:-}"
MAX_ATTEMPTS="${BOT_HEALTH_MAX_ATTEMPTS:-24}"
SLEEP_SECS="${BOT_HEALTH_SLEEP_SECS:-10}"

check_url() {
  local label="$1"
  local url="$2"
  local attempt=1
  local body=""
  local code=""

  echo "→ Health smoke ($label): $url"

  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    code="$(curl -s -o /tmp/bot-health-body.json -w "%{http_code}" "$url" || echo "000")"
    body="$(cat /tmp/bot-health-body.json 2>/dev/null || echo "")"

    if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
      echo "✓ $label OK (attempt $attempt/$MAX_ATTEMPTS)"
      echo "$body" | head -c 500
      echo ""
      return 0
    fi

    echo "  attempt $attempt/$MAX_ATTEMPTS: HTTP $code (waiting ${SLEEP_SECS}s)..."
    if [ -n "$body" ]; then
      echo "  body: $(echo "$body" | tr '\n' ' ' | head -c 200)"
    fi

    attempt=$((attempt + 1))
    sleep "$SLEEP_SECS"
  done

  echo "✗ $label failed after $MAX_ATTEMPTS attempts (last HTTP $code)"
  [ -n "$body" ] && echo "$body"
  return 1
}

check_url "local" "$LOCAL_URL"

if [ -n "$PUBLIC_URL" ]; then
  check_url "public" "$PUBLIC_URL"
else
  echo "→ Skipping public health check (BOT_HEALTH_PUBLIC_URL not set)"
fi

echo "✓ Bot health smoke passed"
