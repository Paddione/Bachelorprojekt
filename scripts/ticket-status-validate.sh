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
case "${BRAND:-}" in
  mentolder|korczewski) ;;
  *) echo '{"error":"unknown BRAND (use mentolder|korczewski)"}' >&2; exit 2 ;;
esac

# DB-Zugang (T900728): ersetzt die mit T900399 entfernte Factory-lib
# (Resolve- und PSQL-Helfer). WORKSPACE_PG_URL gewinnt, sonst kubectl exec
# gegen den shared-db-Pod. SELECT-only — kein Write-Guard noetig.
WS_CTX="${WORKSPACE_CTX:-fleet}"
WS_NS="${WORKSPACE_NS:-workspace}"
case "$WS_CTX" in
  devmesh) ;;
  *-dev)
    case "$WS_NS" in
      workspace) WS_NS="workspace-dev" ;;
    esac
    ;;
esac
_ws_pgpod() {
  local pod all
  pod=$(kubectl get pod -n "$WS_NS" --context "$WS_CTX" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    all=$(kubectl get pod -n "$WS_NS" --context "$WS_CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | tr '\n' ' ')  # pod-phase-filter: intentional-unfiltered
    if [[ -n "${all// /}" ]]; then
      echo "{\"error\":\"no Running shared-db pod in namespace ${WS_NS} (context ${WS_CTX}); found but not Running: ${all% }; override the context with WORKSPACE_CTX\"}" >&2
    else
      echo "{\"error\":\"no shared-db pod found in namespace ${WS_NS} (context ${WS_CTX}); override the context with WORKSPACE_CTX\"}" >&2
    fi
    return 2
  fi
  echo "$pod"
}
_ws_psql() {  # SQL via stdin, TSV auf stdout
  if [[ -n "${WORKSPACE_PG_URL:-}" ]]; then
    psql "$WORKSPACE_PG_URL" -qtA -v ON_ERROR_STOP=1 "$@"
    return
  fi
  local pod sql=""
  if [[ ! -t 0 ]]; then sql="$(cat)"; fi
  pod="$(_ws_pgpod)" || return 2
  if [[ -n "$sql" ]]; then
    kubectl exec -i "$pod" -n "$WS_NS" --context "$WS_CTX" -c postgres -- \
      psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@" <<<"$sql"
  else
    kubectl exec "$pod" -n "$WS_NS" --context "$WS_CTX" -c postgres -- \
      psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@"
  fi
}

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
    result=$(echo "$SQL" | _ws_psql --no-align -F '|' 2>/dev/null || echo "")
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
    echo "$SQL" | _ws_psql 2>/dev/null || echo "No inconsistencies found."
    if [ "$(echo "$SQL" | _ws_psql 2>/dev/null | wc -l)" -gt 0 ]; then
      exit 1
    fi
    exit 0
    ;;
esac
