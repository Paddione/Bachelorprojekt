#!/usr/bin/env bash
# ticket-status-validate.sh — find tickets with inconsistent status/timestamp pairs.
# [T001331] Detects:
#   - status=in_progress AND done_at IS NOT NULL
#   - status=done AND done_at IS NULL
#   - status=awaiting_deploy AND done_at IS NOT NULL
#
# Usage: BRAND=mentolder|korczewski bash scripts/ticket-status-validate.sh
#   --help    Print usage and exit 0
#   --json    Output JSON (default)
#   --table   Output formatted table
#
# Exit: 0 if all ticket status/timestamp pairs are consistent
#       1 if any inconsistencies are found (output includes the rows)
#       2 on usage error
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat >&2 <<EOF
Usage: BRAND=<brand> $0 [--json|--table|--help]
Validates ticket status/timestamp consistency in the database.
EOF
}

MODE="${1:---json}"
case "$MODE" in
  --help) usage; exit 0 ;;
  --json|--table) ;;
  *) echo "FATAL: unknown mode '$MODE'" >&2; usage; exit 2 ;;
esac

if [ -z "${BRAND:-}" ]; then
  echo '{"error":"BRAND is required (mentolder|korczewski)"}' >&2
  exit 2
fi

source "$SCRIPT_DIR/factory/lib.sh"
factory_resolve

SQL="
SELECT id, external_id, status, done_at
FROM tickets.tickets
WHERE (status = 'in_progress' AND done_at IS NOT NULL)
   OR (status = 'done'       AND done_at IS NULL)
   OR (status = 'awaiting_deploy' AND done_at IS NOT NULL)
ORDER BY external_id;
"

case "$MODE" in
  --json)
    result=$(echo "$SQL" | factory_psql --no-align -F '|' 2>/dev/null || echo "")
    if [ -z "$result" ]; then
      echo '{"status":"ok","inconsistencies":[]}'
      exit 0
    fi
    # Convert psql pipe-separated output to JSON array
    echo '{"status":"inconsistent","inconsistencies":['
    first=1
    while IFS='|' read -r id ext_id status done_at; do
      [ -z "$id" ] && continue
      [ "$first" -eq 1 ] || echo ','
      first=0
      printf '  {"id":%s,"external_id":"%s","status":"%s","done_at":"%s"}' "$id" "$ext_id" "$status" "$done_at"
    done <<< "$result"
    echo
    echo ']}'
    exit 1
    ;;
  --table)
    echo "$SQL" | factory_psql 2>/dev/null || echo "No inconsistencies found."
    if [ "$(echo "$SQL" | factory_psql 2>/dev/null | wc -l)" -gt 0 ]; then
      exit 1
    fi
    exit 0
    ;;
esac
