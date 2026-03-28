#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# runner.sh — Homeoffice MVP Test Runner
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   ./tests/runner.sh local              # full local tier
#   ./tests/runner.sh prod               # full prod tier
#   ./tests/runner.sh local FA-01 SA-03  # specific tests
#   ./tests/runner.sh report             # regenerate Markdown
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"
export RESULTS_DIR="${SCRIPT_DIR}/results"
export VERBOSE="${VERBOSE:-false}"

# Source libraries
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/report.sh"
source "${SCRIPT_DIR}/lib/compose.sh"

# ── Argument parsing ─────────────────────────────────────────────
TIER=""
KEEP=false
SPECIFIC_TESTS=()
ENV_FILE="${COMPOSE_DIR}/.env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    local|prod|report) TIER="$1"; shift ;;
    --keep)    KEEP=true; shift ;;
    --verbose) export VERBOSE="true"; shift ;;
    --env)     ENV_FILE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 <local|prod|report> [TEST_IDS...] [--keep] [--verbose] [--env FILE]"
      exit 0 ;;
    *)
      SPECIFIC_TESTS+=("$1"); shift ;;
  esac
done

if [[ -z "$TIER" ]]; then
  echo "Error: Tier required. Usage: $0 <local|prod|report>"
  exit 1
fi

# ── Prerequisites ────────────────────────────────────────────────
check_prereqs() {
  local missing=()
  for cmd in docker jq curl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if (( ${#missing[@]} > 0 )); then
    echo "Fehlende Abhängigkeiten: ${missing[*]}"
    exit 1
  fi
}

# ── Run test files ───────────────────────────────────────────────
run_test_files() {
  local test_dir="$1"
  local files=()

  if (( ${#SPECIFIC_TESTS[@]} > 0 )); then
    for test_id in "${SPECIFIC_TESTS[@]}"; do
      local f="${test_dir}/${test_id}.sh"
      [[ -f "$f" ]] && files+=("$f")
    done
  else
    for f in "${test_dir}"/*.sh; do
      [[ -f "$f" ]] && files+=("$f")
    done
  fi

  for f in "${files[@]}"; do
    local test_name
    test_name=$(basename "$f" .sh)
    echo ""
    echo "━━━ ${test_name} ━━━"
    bash "$f"
  done
}

# ── Report-only mode ────────────────────────────────────────────
if [[ "$TIER" == "report" ]]; then
  echo "▶ Markdown-Reports neu generieren..."
  for json_file in "${RESULTS_DIR}"/*.json; do
    [[ -f "$json_file" ]] || continue
    md_file="${json_file%.json}.md"
    generate_markdown "$json_file" "$md_file"
  done
  exit 0
fi

# ── Setup ────────────────────────────────────────────────────────
check_prereqs
mkdir -p "$RESULTS_DIR"
DATE_TAG=$(date +%Y-%m-%d)
export RESULTS_FILE="${RESULTS_DIR}/.tmp-${TIER}-${DATE_TAG}.jsonl"
> "$RESULTS_FILE"  # truncate

echo "═══════════════════════════════════════════════════════════════"
echo "  Homeoffice MVP — Test Runner (${TIER})"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "═══════════════════════════════════════════════════════════════"

# ── Local tier ───────────────────────────────────────────────────
if [[ "$TIER" == "local" ]]; then
  compose_up
  bootstrap_test_data || echo "⚠ Bootstrap teilweise fehlgeschlagen"

  run_test_files "${SCRIPT_DIR}/local"

  # Run Playwright e2e tests if installed
  if [[ -f "${SCRIPT_DIR}/e2e/package.json" ]]; then
    echo ""
    echo "━━━ Playwright E2E Tests ━━━"
    cd "${SCRIPT_DIR}/e2e"
    if [[ ! -d "node_modules" ]]; then
      npm ci
      npx playwright install chromium
    fi
    TEST_BASE_URL="http://localhost:8065" \
    RESULTS_FILE="$RESULTS_FILE" \
      npx playwright test --reporter=line 2>&1 || true
    cd "$SCRIPT_DIR"
  fi

  if ! $KEEP; then
    compose_down
  else
    echo "▶ --keep: Stack bleibt laufen."
  fi
fi

# ── Prod tier ────────────────────────────────────────────────────
if [[ "$TIER" == "prod" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
  fi
  for var in MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN; do
    if [[ -z "${!var:-}" ]]; then
      echo "Error: ${var} not set. Use --env to specify .env file."
      exit 1
    fi
  done

  run_test_files "${SCRIPT_DIR}/prod"
fi

# ── Finalize ─────────────────────────────────────────────────────
JSON_OUT="${RESULTS_DIR}/${DATE_TAG}-${TIER}.json"
MD_OUT="${RESULTS_DIR}/${DATE_TAG}-${TIER}.md"

finalize_json "$TIER" "$JSON_OUT"
generate_markdown "$JSON_OUT" "$MD_OUT"
rm -f "$RESULTS_FILE"  # clean up temp JSONL

echo ""
assert_summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Reports: ${JSON_OUT}"
echo "           ${MD_OUT}"
echo "═══════════════════════════════════════════════════════════════"
