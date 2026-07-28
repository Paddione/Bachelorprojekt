#!/usr/bin/env bats
# tests/spec/worktree-divergence-guard-T002387.bats
# SSOT spec: openspec/changes/worktree-divergence-guard-T002387/specs/worktree-divergence-guard-T002387.md
#
# Tests that the divergence guard in worktree-create.sh uses a safe fetch that
# does NOT update the local main ref — preventing FATAL when main is checked out
# in another worktree. [T002387]

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/worktree-create.sh"
}

# T002387: The divergence guard must NOT use `git fetch origin main:main` because
# that updates the local branch ref `refs/heads/main`, which Git refuses when
# main is checked out in another worktree:
#   "refusing to fetch into branch refs/heads/main checked out at ..."
# → FATAL: auto-sync failed
#
# expected: FAIL (before fix — still uses `git fetch origin main:main`)
@test "worktree-create.sh uses safe fetch that avoids local main ref update" {
  [ -f "$SCRIPT" ]
  # The fix replaces `git fetch origin main:main` with a fetch that only touches
  # the remote tracking ref: `git fetch origin +refs/heads/main:refs/remotes/origin/main`
  grep -q "refs/remotes/origin/main" "$SCRIPT"
}

# T002387: Verify the problematic `git fetch origin main:main` pattern is GONE.
# expected: FAIL (before fix — the problematic pattern still exists)
@test "worktree-create.sh no longer uses unsafe git fetch origin main:main" {
  [ -f "$SCRIPT" ]
  # Must NOT contain the unsafe pattern
  ! grep -q "git fetch origin main:main" "$SCRIPT"
}
