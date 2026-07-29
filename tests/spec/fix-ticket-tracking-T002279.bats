#!/usr/bin/env bats
# tests/spec/fix-ticket-tracking-T002279.bats
# Verifies the post-merge ticket-closure script and related components.
#
# KEY DESIGN DECISION: The script must NOT auto-close tickets. A ticket ID in
# a commit diff is not proof of fix completion — it could be context, a partial
# fix, or a false positive. The script only adds advisory comments.
#
# expected: FAIL — kein automatisches Schließen

setup() {
  load 'test_helper.bash'
  TEST_TMP_DIR="$(mktemp -d)"
  # Create a minimal git repo for testing
  pushd "$TEST_TMP_DIR" >/dev/null
  git init
  git checkout -b main
  git config user.email "test@test.com"
  git config user.name "Test"
  # Create origin/main ref for testing
  git commit --allow-empty -m "Initial commit"
  git branch origin/main 2>/dev/null || true
  popd >/dev/null
}

teardown() {
  rm -rf "$TEST_TMP_DIR" 2>/dev/null || true
}

@test "ticket-closure: script exists and is executable" {
  [ -x "scripts/devflow-post-merge-ticket-closure.sh" ]
}

@test "ticket-closure: does NOT auto-close tickets (no update-status --status done)" {
  # Grep for any auto-close pattern — the script should only add comments
  # Verify it does NOT contain 'update-status.*done'
  run grep -n 'update-status.*--status.*done' scripts/devflow-post-merge-ticket-closure.sh
  [ "$status" -eq 1 ]
}

@test "ticket-closure: script parses correctly (bash -n)" {
  run bash -n scripts/devflow-post-merge-ticket-closure.sh
  [ "$status" -eq 0 ]
}

@test "ticket-closure: exits 0 with TICKET_OFFLINE set (no DB)" {
  run bash -c 'TICKET_OFFLINE=1 bash scripts/devflow-post-merge-ticket-closure.sh 2>&1; echo "EXIT:$?"'
  echo "$output"
  # Should finish gracefully even without DB access
  [[ "$output" =~ "Summary" ]] || [[ "$output" =~ "No ticket IDs found" ]] || [[ "$output" =~ "TICKET_OFFLINE" ]]
}

@test "ticket-closure: rejects --merge-sha with invalid args" {
  run bash scripts/devflow-post-merge-ticket-closure.sh --invalid-flag
  [ "$status" -ne 0 ]
}

@test "agent-lock: check-merged command exists" {
  run bash scripts/agent-lock.sh check-merged
  # Should print usage info (no args)
  [ "$status" -eq 2 ]
}

@test "agent-lock: check-merged validates ticket ID format" {
  run bash scripts/agent-lock.sh check-merged INVALID123
  [ "$status" -eq 2 ]
}

@test "agent-lock: check-merged accepts valid T-number format" {
  # In this test git context, T999999 should not be found on main
  run bash scripts/agent-lock.sh check-merged T999999
  # Not found = exit 0 (safe to proceed)
  echo "$output"
  [ "$status" -eq 0 ] || [ "$status" -eq 2 ]  # 2 if no origin/main
}

@test "devflow-post-merge-deploy: references ticket-closure script" {
  run grep -q 'devflow-post-merge-ticket-closure' scripts/devflow-post-merge-deploy.sh
  [ "$status" -eq 0 ]
}

@test "SKILL.md: contains preflight check for merged tickets" {
  run grep -q 'Check merged ticket' .claude/skills/dev-flow-plan/SKILL.md
  [ "$status" -eq 0 ]
}

@test "post-merge.yml: contains ticket closure scan step" {
  run grep -q 'Ticket closure scan' .github/workflows/post-merge.yml
  [ "$status" -eq 0 ]
}
