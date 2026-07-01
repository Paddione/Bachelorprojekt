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

# T001391: Post-push sync guard must exist as a dedicated wrapper script
# (git has no native post-push hook, so this cannot live in .githooks/pre-push).
# expected: FAIL (before fix — scripts/git-safe-push.sh does not exist yet)
@test "git-safe-push.sh exists and fetches origin/main after pushing to main" {
  local script="$REPO_ROOT/scripts/git-safe-push.sh"
  [ -f "$script" ]
  # After pushing to main it must re-fetch origin/main to observe the post-push state
  grep -q "git fetch origin main" "$script"
}

# T001391: Content-equivalent divergence (e.g. squash-merge already contains the
# local commit) may auto-reset; a genuine divergence with unique local content
# must never be auto-reset.
# expected: FAIL (before fix — scripts/git-safe-push.sh does not exist yet)
@test "git-safe-push.sh only auto-resets on confirmed content-equivalent divergence" {
  local script="$REPO_ROOT/scripts/git-safe-push.sh"
  [ -f "$script" ]
  # Must use a content-equivalence check (patch-id) before ever resetting
  grep -q "patch-id" "$script"
  # Must guard the destructive reset behind a clean working tree check
  grep -q "reset --hard origin/main" "$script"
  grep -q -- "--porcelain" "$script"
}
