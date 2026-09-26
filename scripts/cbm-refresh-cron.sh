#!/usr/bin/env bash
# scripts/cbm-refresh-cron.sh — Periodischer Auto-Refresh fuer codebase-memory-mcp (K3)
#
# Prueft vor Reindexierung per index_status und detect_changes auf Drift (skip-if-fresh).
# Bei Drift wird der Refresh serialisiert ueber scripts/mcp/cbm-single-flight.sh ausgefuehrt.
#
# Cron-Eintrag (hourly, bzw. 0 */4 * * * bei Fallback):
#   0 * * * * bash /home/patrick/Bachelorprojekt/scripts/cbm-refresh-cron.sh >> /tmp/cbm-refresh-cron.log 2>&1
#   0 */4 * * * bash /home/patrick/Bachelorprojekt/scripts/cbm-refresh-cron.sh >> /tmp/cbm-refresh-cron.log 2>&1
#
# Usage:
#   scripts/cbm-refresh-cron.sh [--dry-run]
#
# Output:
#   stdout: genau eine Zeile JSON mit .status ("fresh-skip", "would-refresh" oder "refreshed")
#   stderr: Diagnosemeldungen (unterdrueckt bei --dry-run)

set -euo pipefail

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

log() {
  if [ "$DRY_RUN" = "false" ]; then
    echo "[cbm-refresh-cron] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >&2
  fi
}

PROJECT="${CBM_PROJECT:-home-patrick-Bachelorprojekt}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="$HOME/.cache/codebase-memory-mcp/${PROJECT}.db"

now=$(date +%s)
if [ -f "$DB_FILE" ]; then
  mtime=$(stat -c %Y "$DB_FILE" 2>/dev/null || echo "$now")
  age=$((now - mtime))
else
  age=999999
fi

changes_json=$(codebase-memory-mcp cli detect_changes --project "$PROJECT" 2>/dev/null || echo "{}")
changed_count=$(echo "$changes_json" | jq -r '.changed_count // 0' 2>/dev/null || echo 0)

if [ "$changed_count" -eq 0 ]; then
  echo "{\"status\":\"fresh-skip\",\"last_refresh_age_s\":$age,\"changed_count\":0}"
  exit 0
fi

if [ "$DRY_RUN" = "true" ]; then
  echo "{\"status\":\"would-refresh\",\"last_refresh_age_s\":$age,\"changed_count\":$changed_count}"
  exit 0
fi

log "Starting fast refresh for project $PROJECT (changed_count=$changed_count, age=${age}s)"

start_s=$(date +%s)
bash "$HERE/mcp/cbm-single-flight.sh" "{\"repo_path\": \"$ROOT\", \"mode\": \"fast\", \"persistence\": true}"
end_s=$(date +%s)
duration_s=$((end_s - start_s))

log "Refresh complete in ${duration_s}s"
echo "{\"status\":\"refreshed\",\"duration_s\":$duration_s,\"last_refresh_age_s\":$age,\"changed_count\":$changed_count}"
