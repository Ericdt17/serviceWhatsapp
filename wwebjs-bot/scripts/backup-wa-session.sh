#!/usr/bin/env bash
# Backup WhatsApp LocalAuth session for disaster recovery (disk loss).
# Does NOT help after LOGOUT — user must rescan QR in that case.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CLIENT_ID="${1:-${CLIENT_ID:-delivery-bot-default}}"
SESSION_DIR=".wwebjs_auth/session-${CLIENT_ID}"
BACKUP_ROOT="${WA_SESSION_BACKUP_DIR:-../backups/wa-session}"
KEEP="${WA_SESSION_BACKUP_KEEP:-7}"

if [ ! -d "$SESSION_DIR" ]; then
  echo "✗ Session directory not found: $SESSION_DIR (CLIENT_ID=$CLIENT_ID)" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
STAMP="$(date +%Y%m%d-%H%M)"
ARCHIVE="${BACKUP_ROOT}/wa-session-${CLIENT_ID}-${STAMP}.tar.gz"

echo "→ Backing up $SESSION_DIR → $ARCHIVE"
tar -czf "$ARCHIVE" -C .wwebjs_auth "session-${CLIENT_ID}"
echo "✓ Created $(du -h "$ARCHIVE" | cut -f1) archive"

if [ "$KEEP" -gt 0 ] 2>/dev/null; then
  echo "→ Pruning old backups (keep $KEEP for $CLIENT_ID)"
  ls -1t "${BACKUP_ROOT}/wa-session-${CLIENT_ID}-"*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "  removing $old"
    rm -f "$old"
  done
fi

echo "✓ Backup complete"
