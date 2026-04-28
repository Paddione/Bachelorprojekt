#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# runner.sh — Workspace MVP Test Runner (k3d)
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   ./tests/runner.sh local              # full local tier (k3d)
#   ./tests/runner.sh local FA-01 SA-03  # specific tests
#   ./tests/runner.sh prod               # full prod tier (k3s)
#   ./tests/runner.sh prod SA-01 NFA-02  # specific prod tests
#   ./tests/runner.sh report             # regenerate Markdown
#
# Prerequisites:
#   - k3d cluster running (task cluster:create)
#   - Workspace stack deployed (task workspace:deploy)
#   - kubectl, jq, curl installed
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
export RESULTS_DIR="${SCRIPT_DIR}/results"
export VERBOSE="${VERBOSE:-false}"
export NAMESPACE="${NAMESPACE:-workspace}"

# Source libraries
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/report.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

# ── Argument parsing ─────────────────────────────────────────────
TIER=""
SPECIFIC_TESTS=()
export JOBS="${JOBS:-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    local|prod|report) TIER="$1"; shift ;;
    --verbose) export VERBOSE="true"; shift ;;
    -j|--jobs) export JOBS="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 <local|prod|report> [TEST_IDS...] [--verbose] [-j|--jobs N]"
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
  local all_files=()

  if (( ${#SPECIFIC_TESTS[@]} > 0 )); then
    for test_id in "${SPECIFIC_TESTS[@]}"; do
      # Support both .sh and .bats extensions
      if [[ -f "${test_dir}/${test_id}.sh" ]]; then
        all_files+=("${test_dir}/${test_id}.sh")
      elif [[ -f "${test_dir}/${test_id}.bats" ]]; then
        all_files+=("${test_dir}/${test_id}.bats")
      fi
    done
  else
    # Find both .sh and .bats files
    while IFS= read -r -d '' f; do
      all_files+=("$f")
    done < <(find "${test_dir}" -maxdepth 1 \( -name "*.sh" -o -name "*.bats" \) -print0 | sort -z)
  fi

  local parallel_files=()
  local serial_files=()
  for f in "${all_files[@]}"; do
    # NFA tests (Non-Functional Requirements) often involve destructive actions
    # like killing pods or stress testing, so they run sequentially.
    if [[ $(basename "$f") =~ ^NFA- ]] || [[ "$JOBS" -le 1 ]]; then
      serial_files+=("$f")
    else
      parallel_files+=("$f")
    fi
  done

  # 1. Parallel Block
  if (( ${#parallel_files[@]} > 0 )); then
    echo "▶ Starte ${#parallel_files[@]} Tests parallel (${JOBS} Jobs)..."
    local running=0
    for f in "${parallel_files[@]}"; do
      local test_name
      test_name=$(basename "$f")
      (
        if [[ "$f" == *.bats ]]; then
          "${SCRIPT_DIR}/unit/lib/bats-core/bin/bats" "$f" > /dev/null 2>&1
        else
          bash "$f" > /dev/null 2>&1
        fi
      ) &
      ((running++))
      if (( running >= JOBS )); then
        wait -n
        ((running--))
      fi
    done
    wait
    echo "✓ Parallele Tests abgeschlossen."
  fi

  # 2. Serial Block
  for f in "${serial_files[@]}"; do
    local test_name
    test_name=$(basename "$f")
    echo ""
    echo "━━━ ${test_name} ━━━"
    # Re-establish port-forwards if they died (e.g. after NFA-03 pod kill)
    if [[ -z "${PROD_DOMAIN:-}" ]]; then
      if declare -f _start_nc_portforward &>/dev/null; then
        if ! curl -s -o /dev/null --max-time 1 "${NC_URL}/status.php" 2>/dev/null; then
          echo "  ↻ NC Port-forward neu aufbauen..."
          _start_nc_portforward
        fi
      fi
    fi
    
    if [[ "$f" == *.bats ]]; then
      "${SCRIPT_DIR}/unit/lib/bats-core/bin/bats" "$f"
    else
      bash "$f"
    fi
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
echo "  Workspace MVP — Test Runner (${TIER} / ${PROD_DOMAIN:-k3d})"
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
    TEST_BASE_URL="http://web.localhost" \
    RESULTS_FILE="$RESULTS_FILE" \
      npx playwright test --reporter=line 2>&1 || true
    cd "$SCRIPT_DIR"
  fi
fi

# ── Prod tier (k3s) ─────────────────────────────────────────────
if [[ "$TIER" == "prod" ]]; then
  if [[ -z "${PROD_DOMAIN:-}" ]]; then
    echo "Error: PROD_DOMAIN is required for prod tier."
    echo "  Example: PROD_DOMAIN=${PROD_DOMAIN} $0 prod"
    exit 1
  fi
  export PROD_DOMAIN

  # Check prod-specific tools (optional but warn)
  for cmd in nmap ab; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "  ⚠ '${cmd}' nicht installiert — einige Tests werden übersprungen"
    fi
  done

  # Verify prod is reachable before running tests
  echo "▶ Prüfe Erreichbarkeit von ${PROD_DOMAIN}..."
  if ! curl -sk -o /dev/null --max-time 10 "https://auth.${PROD_DOMAIN}/health/ready" 2>/dev/null; then
    echo "  ⚠ Keycloak auf auth.${PROD_DOMAIN} nicht erreichbar — Tests starten trotzdem"
  else
    echo "  Keycloak erreichbar."
  fi

  run_test_files "${SCRIPT_DIR}/prod"
fi

# ── Cleanup port-forwards ───────────────────────────────────────
if declare -f _stop_nc_portforward &>/dev/null; then _stop_nc_portforward; fi

# ── Finalize ─────────────────────────────────────────────────────
JSON_OUT="${RESULTS_DIR}/${DATE_TAG}-${TIER}.json"
MD_OUT="${RESULTS_DIR}/${DATE_TAG}-${TIER}.md"

finalize_json "$TIER" "$JSON_OUT"
generate_markdown "$JSON_OUT" "$MD_OUT"

# ── Done ─────────────────────────────────────────────────────────

echo ""
assert_summary
rm -f "$RESULTS_FILE"  # clean up temp JSONL
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Reports: ${JSON_OUT}"
echo "           ${MD_OUT}"
echo "═══════════════════════════════════════════════════════════════"
