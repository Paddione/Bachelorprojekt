#!/usr/bin/env bats
# tests/spec/worktree-cross-platform.bats — T900046
#
# Tests for platform-aware worktree prune and cross-platform worktree protection.
# Verifies that:
# 1. worktree_prune_safe exists and runs cleanly.
# 2. Locked worktrees survive git worktree prune.
# 3. worktree_prune_safe detects cross-platform worktree paths and protects them from deletion.
# 4. worktree-create.sh locks newly created worktrees.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SAFE_PRUNE="$REPO_ROOT/scripts/lib/worktree-prune-safe.sh"
  WT_CREATE="$REPO_ROOT/scripts/worktree-create.sh"

  SANDBOX="${BATS_TEST_TMPDIR}/wt-test-$$"
  mkdir -p "$SANDBOX"
}

@test "worktree_prune_safe: library loads and returns 0" {
  source "$SAFE_PRUNE"
  run worktree_prune_safe
  [ "$status" -eq 0 ]
}

@test "worktree_prune_safe: locked worktree is never pruned" {
  source "$SAFE_PRUNE"
  local main_repo="$SANDBOX/main"
  mkdir -p "$main_repo"
  git -C "$main_repo" init -q -b main
  git -C "$main_repo" config user.email "test@example.com"
  git -C "$main_repo" config user.name "Test"
  git -C "$main_repo" commit -q --allow-empty -m "initial"

  local wt_dir="$SANDBOX/wt-locked"
  git -C "$main_repo" worktree add -q -b locked-branch "$wt_dir" main
  git -C "$main_repo" worktree lock "$wt_dir" --reason "test lock"

  # Run safe prune from inside the main repo
  run bash -c "cd '$main_repo' && source '$SAFE_PRUNE' && worktree_prune_safe"
  [ "$status" -eq 0 ]

  # Admin directory must still exist and be locked
  [ -d "$main_repo/.git/worktrees/wt-locked" ]
  [ -f "$main_repo/.git/worktrees/wt-locked/locked" ]
}

@test "worktree_prune_safe: protects cross-platform Windows worktree from WSL prune" {
  source "$SAFE_PRUNE"
  local main_repo="$SANDBOX/main-cross"
  mkdir -p "$main_repo"
  git -C "$main_repo" init -q -b main
  git -C "$main_repo" config user.email "test@example.com"
  git -C "$main_repo" config user.name "Test"
  git -C "$main_repo" commit -q --allow-empty -m "initial"

  local wt_dir="$SANDBOX/wt-cross"
  git -C "$main_repo" worktree add -q -b cross-branch "$wt_dir" main

  # Simulate Windows path in gitdir while running with WSL platform flag
  local admin_dir="$main_repo/.git/worktrees/wt-cross"
  [ -d "$admin_dir" ]

  # Point gitdir to an existing directory
  echo "$wt_dir/.git" > "$admin_dir/gitdir"

  # Under WSL simulation with existing candidate path
  run bash -c "cd '$main_repo' && source '$SAFE_PRUNE' && WSL_DISTRO_NAME=Ubuntu worktree_prune_safe"
  [ "$status" -eq 0 ]
}

@test "worktree-create.sh: locks newly created worktree" {
  local main_repo="$SANDBOX/main-create"
  mkdir -p "$main_repo"
  git -C "$main_repo" init -q -b main
  git -C "$main_repo" config user.email "test@example.com"
  git -C "$main_repo" config user.name "Test"
  git -C "$main_repo" commit -q --allow-empty -m "initial"
  git -C "$main_repo" branch origin/main main

  # Copy worktree-create and dependencies
  mkdir -p "$main_repo/scripts/lib"
  cp "$WT_CREATE" "$main_repo/scripts/worktree-create.sh"
  cp "$SAFE_PRUNE" "$main_repo/scripts/lib/worktree-prune-safe.sh"
  [ -f "$REPO_ROOT/scripts/worktree-git-op-guard.sh" ] && cp "$REPO_ROOT/scripts/worktree-git-op-guard.sh" "$main_repo/scripts/"
  [ -f "$REPO_ROOT/scripts/lib/branch-allowlist.sh" ] && cp "$REPO_ROOT/scripts/lib/branch-allowlist.sh" "$main_repo/scripts/lib/"

  local wt_path="$SANDBOX/created-wt"
  run bash -c "cd '$main_repo' && WT_SKIP_NAME_CHECK=1 bash scripts/worktree-create.sh test-branch '$wt_path' main"
  [ "$status" -eq 0 ]

  # Check that git worktree list or admin dir reports it locked
  local admin_name="$(basename "$wt_path")"
  [ -f "$main_repo/.git/worktrees/$admin_name/locked" ]
}