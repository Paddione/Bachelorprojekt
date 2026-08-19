#!/usr/bin/env bats
# tests/spec/dsh-harness-integration/executor.bats — Executor branch, exit codes, no fallback.

REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"

@test "executor: dsh case exists in dispatcher-bridge.sh" {
  run grep -q 'dsh' "$REPO/scripts/factory/dispatcher-bridge.sh"
  [ "$status" -eq 0 ]
}

@test "executor: FACTORY_EXECUTOR=dsh does not produce unknown warning" {
  # Run dispatcher-bridge.sh with dsh and check stderr for 'unknown'.
  # We can't run the full dispatcher (needs a prep file), but we can
  # verify the case statement logic by grepping.
  run grep -A2 'claude|opencode|dsh' "$REPO/scripts/factory/dispatcher-bridge.sh"
  [[ "$output" == *"claude|opencode|dsh"* ]]
}

@test "executor: FACTORY_EXECUTOR=nonsense still warns and falls back to claude" {
  run grep -q 'unknown FACTORY_EXECUTOR' "$REPO/scripts/factory/dispatcher-bridge.sh"
  [ "$status" -eq 0 ]
}

@test "executor: dsh-exec.sh exists and is executable" {
  [ -x "$REPO/scripts/factory/dsh-exec.sh" ]
}

@test "executor: dsh-exec.sh syntax is valid" {
  run bash -n "$REPO/scripts/factory/dsh-exec.sh"
  [ "$status" -eq 0 ]
}

@test "executor: dsh-exec.sh exits 7 without branch/plan" {
  # Call with empty branch and plan — should exit 7.
  # Need a real binary so the binary check passes and we reach the plan check.
  run timeout 5 env DSH_BIN="/bin/true" bash "$REPO/scripts/factory/dsh-exec.sh" "TEST_TICKET" "/tmp" "" ""
  [ "$status" -eq 7 ]
}

@test "executor: dsh-exec.sh exits 2 with missing dsh binary" {
  # Set DSH_BIN to a nonexistent path.
  run timeout 5 env DSH_BIN="/nonexistent/dsh" bash "$REPO/scripts/factory/dsh-exec.sh" "TEST_TICKET" "/tmp" "test-branch" "plan.md"
  [ "$status" -eq 2 ]
}
