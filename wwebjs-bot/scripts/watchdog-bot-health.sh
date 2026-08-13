#!/usr/bin/env bash
# Compatibility wrapper — canonical script lives in devops/
# Existing VPS crontabs pointing at scripts/watchdog-bot-health.sh keep working.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/devops/watchdog-bot-health.sh" "$@"
