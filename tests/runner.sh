#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# runner.sh — Homeoffice MVP Test Runner (k3d)
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   ./tests/runner.sh local              # full local tier (k3d)
#   ./tests/runner.sh local FA-01 SA-03  # specific tests
#   ./tests/runner.sh report             # regenerate Markdown
#
# Prerequisites:
#   - k3d cluster running (task cluster:create)
#   - Homeoffice stack deployed (task homeoffice:deploy)
#   - kubectl, jq, curl installed
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
export RESULTS_DIR="${SCRIPT_DIR}/results"
export VERBOSE="${VERBOSE:-false}"
export NAMESPACE="${NAMESPACE:-homeoffice}"

# Source libraries
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/report.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

# ── Argument parsing ─────────────────────────────────────────────
TIER=""
SPECIFIC_TESTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    local|report) TIER="$1"; shift ;;
    --verbose) export VERBOSE="true"; shift ;;
    -h|--help)
      echo "Usage: $0 <local|report> [TEST_IDS...] [--verbose]"
      exit 0 ;;
    *)
      SPECIFIC_TESTS+=("$1"); shift ;;
  esac
done

if [[ -z "$TIER" ]]; then
  echo "Error: Tier required. Usage: $0 <local|report>"
  exit 1
fi

# ── Prerequisites ────────────────────────────────────────────────
check_prereqs() {
  local missing=()
  for cmd in kubectl jq curl; do
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
echo "  Homeoffice MVP — Test Runner (${TIER} / k3d)"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "═══════════════════════════════════════════════════════════════"

# ── Local tier (k3d) ────────────────────────────────────────────
if [[ "$TIER" == "local" ]]; then
  k3d_wait
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
    TEST_BASE_URL="http://chat.localhost" \
    RESULTS_FILE="$RESULTS_FILE" \
      npx playwright test --reporter=line 2>&1 || true
    cd "$SCRIPT_DIR"
  fi
fi

# ── Finalize ─────────────────────────────────────────────────────
JSON_OUT="${RESULTS_DIR}/${DATE_TAG}-${TIER}.json"
MD_OUT="${RESULTS_DIR}/${DATE_TAG}-${TIER}.md"

finalize_json "$TIER" "$JSON_OUT"
generate_markdown "$JSON_OUT" "$MD_OUT"

echo ""
assert_summary
rm -f "$RESULTS_FILE"  # clean up temp JSONL
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Reports: ${JSON_OUT}"
echo "           ${MD_OUT}"
echo "═══════════════════════════════════════════════════════════════"
