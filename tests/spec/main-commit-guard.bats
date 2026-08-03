#!/usr/bin/env bats
# tests/spec/main-commit-guard.bats
# SSOT: openspec/changes/main-commit-guard/specs/main-commit-guard.md
# T002631: pre-commit hook blocks commits on main branch.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  HOOK="$REPO_ROOT/.githooks/pre-commit"
}

# Source-inspection drift-guard pattern (same as T001388/T001973 tests).
# We verify the guard logic by inspecting the hook file rather than executing
# in a temp-repo — the hook's branch-detection logic is the SUT.

@test "T002631: pre-commit hook contains a guard against commits on main branch (RED against main)" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  # The guard must check that the current branch is NOT main/master.
  grep -qE 'main-commit-guard|SKIP_MAIN_COMMIT_GUARD|MAIN_COMMIT_GUARD' "$HOOK" \
    || { echo "MISSING main-commit-guard section in $HOOK"; return 1; }
}

@test "T002631: main-commit-guard checks for main and master branch names" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  # The guard section itself must reference 'main' or 'master' in a blocking context.
  awk '/main-commit-guard/,/^[[:space:]]*fi[[:space:]]*$/' "$HOOK" | grep -qE '"main"|"master"' \
    || { echo "main/master not referenced in guard context in $HOOK"; return 1; }
}

@test "T002631: main-commit-guard supports SKIP_MAIN_COMMIT_GUARD bypass" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  grep -qE 'SKIP_MAIN_COMMIT_GUARD' "$HOOK" \
    || { echo "MISSING SKIP_MAIN_COMMIT_GUARD bypass in $HOOK"; return 1; }
}

@test "T002631: main-commit-guard allows CI automation (CI or GITHUB_ACTIONS env)" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  # The guard must check for CI/GITHUB_ACTIONS to let bots through.
  awk '/main-commit-guard/,/^[[:space:]]*fi[[:space:]]*$/' "$HOOK" | grep -qE 'CI|GITHUB_ACTIONS' \
    || { echo "CI/GITHUB_ACTIONS not checked in guard context in $HOOK"; return 1; }
}

@test "T002631: main-commit-guard error message directs agent to worktree+branch+ticket+PR workflow" {
  [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
  # The guard's error/warning message must mention the proper workflow.
  # At minimum it should mention 'worktree' or 'branch' or 'ticket' or 'PR'.
  awk '/main-commit-guard/,/^[[:space:]]*fi/' "$HOOK" | grep -qiE 'worktree|branch|ticket|PR|pull.request' \
    || { echo "guard error message does not direct agent to proper workflow in $HOOK"; return 1; }
}
