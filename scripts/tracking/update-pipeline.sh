#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# update-pipeline.sh — Manually update pipeline stages
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   ./scripts/tracking/update-pipeline.sh FA-01 implementation done
#   ./scripts/tracking/update-pipeline.sh FA-01 implementation done --commit abc123
#   ./scripts/tracking/update-pipeline.sh FA-01 documentation done --note "Added to architecture.md"
#   ./scripts/tracking/update-pipeline.sh --bulk-docs FA-01 FA-02 SA-03
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DB="${PROJECT_DIR}/tracking.db"

if [[ ! -f "$DB" ]]; then
  echo "Error: tracking.db not found. Run init-db.sh first." >&2
  exit 1
fi

usage() {
  echo "Usage:"
  echo "  $0 <REQ_ID> <STAGE> <STATUS> [--commit SHA] [--note TEXT]"
  echo "  $0 --bulk-docs <REQ_ID...>    # mark documentation=done for multiple reqs"
  echo ""
  echo "Stages:  idea, implementation, testing, documentation, archive"
  echo "Status:  pending, in_progress, done, fail, skip"
  exit 1
}

# ── Bulk docs mode ───────────────────────────────────────────────
if [[ "${1:-}" == "--bulk-docs" ]]; then
  shift
  for req_id in "$@"; do
    sqlite3 "$DB" "UPDATE pipeline SET status = 'done', updated_at = datetime('now')
      WHERE req_id = '${req_id}' AND stage = 'documentation';"
    echo "  ${req_id} documentation → done"
  done
  exit 0
fi

# ── Single update mode ───────────────────────────────────────────
[[ $# -ge 3 ]] || usage

REQ_ID="$1"
STAGE="$2"
STATUS="$3"
shift 3

COMMIT=""
NOTE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) COMMIT="$2"; shift 2 ;;
    --note)   NOTE="$2"; shift 2 ;;
    *) usage ;;
  esac
done

# Validate requirement exists
exists=$(sqlite3 "$DB" "SELECT COUNT(*) FROM requirements WHERE id = '${REQ_ID}';")
if [[ "$exists" -eq 0 ]]; then
  echo "Error: Unknown requirement '${REQ_ID}'" >&2
  sqlite3 "$DB" "SELECT id, name FROM requirements ORDER BY id;" | column -t -s '|'
  exit 1
fi

# Build update query
commit_clause=""
[[ -n "$COMMIT" ]] && commit_clause=", commit_ref = '${COMMIT}'"
note_clause=""
[[ -n "$NOTE" ]] && note_clause=", notes = '${NOTE//\'/\'\'}'"

sqlite3 "$DB" "UPDATE pipeline
  SET status = '${STATUS}', updated_at = datetime('now') ${commit_clause} ${note_clause}
  WHERE req_id = '${REQ_ID}' AND stage = '${STAGE}';"

echo "${REQ_ID} ${STAGE} → ${STATUS}"

# Show current state
sqlite3 -header -column "$DB" "SELECT * FROM v_pipeline_status WHERE id = '${REQ_ID}';"
