#!/usr/bin/env bats
# FA-SF-46: cleanup.sh removes factory branch + worktree after pipeline completion.
# All operations are best-effort (always exit 0). The script is idempotent — calling
# it with a non-existent branch/worktree is a clean no-op.

@test "FA-SF-46: cleanup.sh parses without syntax errors" {
  run bash -n scripts/factory/cleanup.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: cleanup.sh is executable" {
  [ -x scripts/factory/cleanup.sh ]
}

@test "FA-SF-46: cleanup.sh exits 0 with missing args (idempotent)" {
  run bash scripts/factory/cleanup.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: cleanup.sh exits 0 for non-existent branch" {
  run bash scripts/factory/cleanup.sh --branch "nonexistent-fa-sf-46-deadbeef"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "nothing to clean up" ]]
}

@test "FA-SF-46: cleanup.sh exits 0 for non-existent worktree" {
  run bash scripts/factory/cleanup.sh --worktree "/tmp/wt-nonexistent-fa-sf-46"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "nothing to clean up" ]]
}

@test "FA-SF-46: cleanup.sh removes a real branch + worktree" {
  # Create a disposable branch and worktree, then clean them up.
  git branch -D fa-sf-46-test-cleanup 2>/dev/null || true
  git branch fa-sf-46-test-cleanup
  git worktree add --no-checkout /tmp/wt-fa-sf-46-test fa-sf-46-test-cleanup 2>/dev/null || true

  run bash scripts/factory/cleanup.sh --branch "fa-sf-46-test-cleanup" --worktree "/tmp/wt-fa-sf-46-test"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "removed" ]]

  # Verify both are gone.
  run git show-ref --verify --quiet "refs/heads/fa-sf-46-test-cleanup" 2>/dev/null
  [ "$status" -ne 0 ]
  [ ! -d /tmp/wt-fa-sf-46-test ]
}

@test "FA-SF-46: cleanup.sh is idempotent (call twice in a row)" {
  # First call cleans up (nothing exists from previous test — already cleaned).
  run bash scripts/factory/cleanup.sh --branch "fa-sf-46-test-cleanup" --worktree "/tmp/wt-fa-sf-46-test"
  [ "$status" -eq 0 ]

  # Second call on already-cleaned targets is also a no-op.
  run bash scripts/factory/cleanup.sh --branch "fa-sf-46-test-cleanup" --worktree "/tmp/wt-fa-sf-46-test"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "nothing to clean up" ]]
}

@test "FA-SF-46: pipeline.js wraps main body in try/finally" {
  # finally block must contain the cleanup agent call.
  run grep -Eq '} finally \{' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: pipeline.js finally block calls cleanup.sh" {
  run grep -Eq 'scripts/factory/cleanup\.sh' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: pipeline.js cleanup is wrapped in try/catch (never masks real result)" {
  run grep -Eq 'catch[[:space:]]*\(_\)' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: pipeline.js cleanup passes both WORK_BRANCH and WORK_WT" {
  # The invocation is inside a JS template literal: --branch ${WORK_BRANCH} --worktree ${WORK_WT}
  run grep -Eq 'cleanup\.sh.*--branch.*WORK_BRANCH.*--worktree.*WORK_WT' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}
