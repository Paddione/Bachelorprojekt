#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# status.sh — Display pipeline status from tracking.db
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   ./scripts/tracking/status.sh              # full pipeline overview
#   ./scripts/tracking/status.sh --category FA # filter by category
#   ./scripts/tracking/status.sh --failing     # only failing requirements
#   ./scripts/tracking/status.sh --summary     # progress summary
#   ./scripts/tracking/status.sh --tests       # latest test results
#   ./scripts/tracking/status.sh --history     # test run history
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DB="${PROJECT_DIR}/tracking.db"

# Colors (actual escape sequences, not literals)
G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[1;33m'; B=$'\033[0;34m'
C=$'\033[0;36m'; W=$'\033[0;37m'; NC=$'\033[0m'

if [[ ! -f "$DB" ]]; then
  echo "Error: tracking.db not found. Run init-db.sh first." >&2
  exit 1
fi

# ── Status symbols ───────────────────────────────────────────────
colorize_status() {
  sed -E \
    -e "s/\bin_progress\b/${Y}in_progress${NC}/g" \
    -e "s/\bdone\b/${G}done${NC}/g" \
    -e "s/\bfail\b/${R}fail${NC}/g" \
    -e "s/\bpending\b/${W}pending${NC}/g" \
    -e "s/\bskip\b/${C}skip${NC}/g"
}

# ── Default: full pipeline ───────────────────────────────────────
show_pipeline() {
  local where=""
  [[ -n "${1:-}" ]] && where="WHERE category = '${1}'"

  echo ""
  echo -e "${B}═══ Homeoffice MVP — Pipeline Status ═══${NC}"
  echo ""

  sqlite3 -separator ' | ' "$DB" "
    SELECT
      printf('%-6s', id),
      printf('%-25s', substr(name, 1, 25)),
      printf('%-11s', idea),
      printf('%-11s', implementation),
      printf('%-11s', testing),
      printf('%-13s', documentation),
      archive
    FROM v_pipeline_status ${where}
    ORDER BY category, id;
  " | while IFS= read -r line; do
    echo -e "  $(echo "$line" | colorize_status)"
  done

  echo ""
  echo -e "  ${G}done${NC}  ${R}fail${NC}  ${Y}in_progress${NC}  ${W}pending${NC}  ${C}skip${NC}"
  echo ""
}

show_summary() {
  echo ""
  echo -e "${B}═══ Progress Summary ═══${NC}"
  echo ""
  sqlite3 -header -column "$DB" "SELECT * FROM v_progress_summary;"

  echo ""
  local total done
  total=$(sqlite3 "$DB" "SELECT COUNT(*) FROM pipeline;")
  done=$(sqlite3 "$DB" "SELECT COUNT(*) FROM pipeline WHERE status = 'done';")
  local pct=$((done * 100 / total))
  echo -e "  Overall: ${G}${done}${NC}/${total} stages complete (${pct}%)"
  echo ""

  # Per-category breakdown
  echo -e "${B}  Per category:${NC}"
  sqlite3 -separator ' ' "$DB" "
    SELECT
      printf('  %-4s', r.category),
      printf('%d/%d done',
        COUNT(*) FILTER (WHERE p.status = 'done'),
        COUNT(*)),
      printf('(%d fail)',
        COUNT(*) FILTER (WHERE p.status = 'fail'))
    FROM pipeline p
    JOIN requirements r ON r.id = p.req_id
    GROUP BY r.category
    ORDER BY r.category;
  " | while IFS= read -r line; do
    echo -e "  $line"
  done
  echo ""
}

show_failing() {
  echo ""
  echo -e "${R}═══ Failing Requirements ═══${NC}"
  echo ""
  sqlite3 -header -column "$DB" "
    SELECT p.req_id, r.name, p.stage, p.updated_at, p.notes
    FROM pipeline p
    JOIN requirements r ON r.id = p.req_id
    WHERE p.status = 'fail'
    ORDER BY p.req_id, p.stage;
  "
  echo ""
}

show_tests() {
  echo ""
  echo -e "${B}═══ Latest Test Results ═══${NC}"
  echo ""
  sqlite3 -header -column "$DB" "SELECT * FROM v_latest_tests;"
  echo ""
}

show_history() {
  echo ""
  echo -e "${B}═══ Test Run History ═══${NC}"
  echo ""
  sqlite3 -header -column "$DB" "
    SELECT id, run_date, tier, total, pass, fail, skip,
           printf('%d%%', pass * 100 / MAX(total, 1)) AS pass_rate
    FROM test_runs
    ORDER BY id DESC
    LIMIT 20;
  "
  echo ""
}

# ── Dispatch ─────────────────────────────────────────────────────
case "${1:-}" in
  --category)  show_pipeline "${2:?Specify category: FA, SA, NFA, AK, L}" ;;
  --failing)   show_failing ;;
  --summary)   show_summary ;;
  --tests)     show_tests ;;
  --history)   show_history ;;
  -h|--help)
    echo "Usage: $0 [--category CAT | --failing | --summary | --tests | --history]"
    exit 0 ;;
  *)           show_pipeline; show_summary ;;
esac
