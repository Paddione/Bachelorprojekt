#!/usr/bin/env bats
# tests/spec/divergence-guard.bats
# SSOT spec: openspec/specs/ci-cd.md (capability divergence-guard)
# Tests for local main divergence check in scripts/worktree-create.sh

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-create.sh"
}

# T001302: Divergence guard must exist in worktree-create.sh (no content test)
# expected: FAIL (before fix — guard is not yet implemented)
@test "worktree-create.sh has a divergence guard for local main" {
  [ -f "$SCRIPT" ]
  # The guard checks: git merge-base --is-ancestor origin/main main
  grep -q "merge-base.*is-ancestor.*origin/main.*main" "$SCRIPT"
}
