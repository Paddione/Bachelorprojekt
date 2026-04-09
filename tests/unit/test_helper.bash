#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# test_helper.bash — Shared setup for BATS unit tests
# ═══════════════════════════════════════════════════════════════════

UNIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${UNIT_DIR}/../.." && pwd)"

# Load BATS libraries
load "${UNIT_DIR}/lib/bats-support/load"
load "${UNIT_DIR}/lib/bats-assert/load"

# Create a temporary RESULTS_FILE for assert.sh tests
setup_results_file() {
  export RESULTS_FILE="${BATS_TEST_TMPDIR}/results.jsonl"
  export VERBOSE="false"
  > "$RESULTS_FILE"
}

# Count results by status in RESULTS_FILE
count_status() {
  local status="$1"
  grep -c "\"status\":\"${status}\"" "$RESULTS_FILE" 2>/dev/null || echo 0
}

# Get the last result's detail field
last_detail() {
  tail -1 "$RESULTS_FILE" | jq -r '.detail'
}

# Get the last result's status field
last_status() {
  tail -1 "$RESULTS_FILE" | jq -r '.status'
}
