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
  # website/src/components/inbox/InboxApp.svelte is baselined (> 500 .svelte limit) in baseline.json.
  # (After T001155/G-RH01 Batch 2, scripts/backup-restore.sh is no longer in baseline.json because
  # the refactor brought it under 500 LOC. G-FE03 added browserLogger import → 1018. T001353: a later
  # cleanup PR shrank the file back to 1013 LOC and the baseline was updated accordingly, but this
  # test still hardcoded the stale 1018 expectation — read the current baseline.metric dynamically
  # instead of hardcoding a snapshot, so this test can't go stale again the same way.)
  local baseline_metric
  baseline_metric=$(jq -r '."S1:website/src/components/inbox/InboxApp.svelte".metric' \
    "$REPO/docs/code-quality/baseline.json")
  [ "$baseline_metric" != "null" ] && [ -n "$baseline_metric" ]
  local expected
  expected=$((baseline_metric > 500 ? baseline_metric : 500))
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" effective_threshold "website/src/components/inbox/InboxApp.svelte"
  [ "$status" -eq 0 ]
  [ "$output" = "$expected" ]
}

@test "B1 math: residual_budget = threshold - wc -l on a live file" {
  # plan-context.sh is unbaselined .sh -> 500 - wc-l (computed at test time)
  expected=$((500 - $(wc -l < "$REPO/scripts/plan-context.sh")))
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" residual_budget "scripts/plan-context.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "$expected" ]
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

@test "--json emits a parseable verdict object for a passing plan" {
  run bash "$LINT" --json "$FIX/good.md"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="PASS"; assert isinstance(d["hard"],list); assert isinstance(d["warn"],list)'
}

@test "--json emits FAIL verdict with hard array for a broken plan" {
  run bash "$LINT" --json "$FIX/missing-title.md"
  [ "$status" -eq 1 ]
  echo "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="FAIL"; assert len(d["hard"])>=1'
}

# === T001791 hardening: gates.yaml SSOT for the S1 limits ===

@test "#1: _ext_limit reads the .ts limit from gates.yaml (single source of truth)" {
  gates_val=$(yq -r '.s1.limits[".ts"]' "$REPO/docs/code-quality/gates.yaml")
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" _ext_limit "foo.ts"
  [ "$status" -eq 0 ]
  [ "$output" = "$gates_val" ]
}

@test "#1: _ext_limit reads the .cjs limit from gates.yaml (not a hardcoded mirror)" {
  gates_val=$(yq -r '.s1.limits[".cjs"]' "$REPO/docs/code-quality/gates.yaml")
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" _ext_limit "foo.cjs"
  [ "$status" -eq 0 ]
  [ "$output" = "$gates_val" ]
}

@test "#1: an extension absent from gates.yaml is ungated (0)" {
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" _ext_limit "foo.md"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# === T001791 hardening: STRUCT2 needs a real test-runner invocation, not just the phrase ===

@test "#2: STRUCT2 hard-fails when the fail phrase has no test-runner invocation" {
  run bash "$LINT" "$FIX/struct2-phrase-no-testcmd.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'STRUCT2'
}

@test "#2: good.md still passes STRUCT2 (has a bats invocation)" {
  run bash "$LINT" "$FIX/good.md"
  [ "$status" -eq 0 ]
}

# === T001791 hardening: W3 File-Structure ↔ tasks cross-check (advisory) ===

@test "#3: W3 warns when a File-Structure file is never touched by a task" {
  run bash "$LINT" "$FIX/fs-orphan.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'W3'
  echo "$output" | grep -q 'never-touched-orphan'
}

@test "#3: good.md emits no W3 (every File-Structure file is referenced in a task)" {
  run bash "$LINT" "$FIX/good.md"
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q 'W3'
}

# === T001791 hardening: G1 must not count the File Structure list as a phantom task ===

@test "#5: G1 does not fire on the File Structure file list (no task exceeds 3 files)" {
  run bash "$LINT" "$FIX/g1-filestructure.md"
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q 'G1'
}
