#!/usr/bin/env bats
# Tests for scripts/plan-lint.sh — the deterministic fail-closed plan linter.
# Offline-safe: reads only plan markdown + docs/code-quality/baseline.json + wc -l.

setup() {
  LINT="$BATS_TEST_DIRNAME/../../scripts/plan-lint.sh"
  FIX="$BATS_TEST_DIRNAME/fixtures/plan-lint"
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "good plan passes (exit 0, PASS verdict)" {
  run bash "$LINT" "$FIX/good.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'PLAN-LINT: PASS'
}

@test "F1: missing title: is a hard fail (exit 1)" {
  run bash "$LINT" "$FIX/missing-title.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'F1'
  echo "$output" | grep -q 'PLAN-LINT: FAIL'
}
