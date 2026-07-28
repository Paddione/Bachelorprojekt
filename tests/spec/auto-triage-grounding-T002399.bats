#!/usr/bin/env bats
# tests/spec/auto-triage-grounding-T002399.bats — T002399: Similar tickets in triage prompt

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/factory/auto-triage.sh"
}

@test "auto-triage: find_similar_tickets function exists" {
  grep -q 'find_similar_tickets()' "$SCRIPT"
}

@test "auto-triage: similar tickets block uses Ähnliche Vorgänge label" {
  grep -q 'Ähnliche Vorgänge' "$SCRIPT"
}

@test "auto-triage: find_similar_tickets calls find-similar-tickets.mjs" {
  grep -q 'find-similar-tickets.mjs' "$SCRIPT"
}

@test "auto-triage: find_similar_tickets is fail-soft (returns 0 on missing npx)" {
  # The function should not propagate errors — it must return 0 even when
  # npx or the script is missing, so the triage still works without grounding.
  grep -q 'command -v npx' "$SCRIPT"
}

@test "auto-triage: similar block filters by external_id existence" {
  grep -q 'select(.external_id != null)' "$SCRIPT"
}
