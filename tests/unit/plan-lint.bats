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

@test "STRUCT3: missing 'task freshness:check' in verify task is a hard fail" {
  run bash "$LINT" "$FIX/missing-verify.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'STRUCT3'
}

@test "STRUCT3 requires test:changed not test:all (consistency with linter contract)" {
  # good.md uses 'task test:changed' and must pass STRUCT3
  run bash "$LINT" "$FIX/good.md"
  [ "$status" -eq 0 ]
}

@test "P1: a TODO placeholder in a task body is a hard fail" {
  run bash "$LINT" "$FIX/placeholder-todo.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'P1'
}

@test "B1 math: ungated extension (.md) -> effective threshold 0" {
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" effective_threshold "docs/foo.md"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "B1 math: unbaselined .sh -> effective threshold = static 500" {
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" effective_threshold "scripts/never-baselined-xyz.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "500" ]
}

@test "B1 math: baselined file uses max(limit, baseline.metric)" {
  # scripts/backup-restore.sh is baselined at 1037 (> 500 .sh limit) in baseline.json
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" effective_threshold "scripts/backup-restore.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "1037" ]
}

@test "B1 math: residual_budget = threshold - wc -l on a live file" {
  # plan-context.sh is 34 lines, unbaselined .sh -> 500 - 34 = 466
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" residual_budget "scripts/plan-context.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "466" ]
}

@test "B1a: a self-reported budget contradicting the computed value is a hard fail" {
  run bash "$LINT" "$FIX/wrong-budget.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'B1a'
}

@test "B1b: file over its effective threshold without a split step warns (exit 0)" {
  run bash "$LINT" "$FIX/over-threshold.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'B1b'
  echo "$output" | grep -qE 'PLAN-LINT: PASS \([0-9]+ hard, [1-9]'
}
