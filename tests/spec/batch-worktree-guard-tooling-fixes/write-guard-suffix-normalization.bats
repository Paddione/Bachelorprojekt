#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation
# Fix: T003991 (p2)

setup() {
  REPO_ROOT="$(pwd)"
  BATS_TMPDIR=$(mktemp -d)
  REPO="$BATS_TMPDIR/repo"
  mkdir -p "$REPO/wt-real"
  mkdir -p "$REPO/wt-other"
  touch "$REPO/wt-real/README.md"
  touch "$REPO/wt-other/README.md"

  cd "$REPO"
  git init -b main
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch README.md
  git add README.md
  git commit -m "chore: init"

  # Create lock files
  export AGENT_LOCK_DIR="$BATS_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  
  export SID="sid-p6-test"
  export AGENT_LOCK_SID="$SID"

  # Lock 1: dead lock (suffix drift)
  echo "{\"owner_sid\":\"$SID\",\"owner_pid\":\"1234\",\"worktree\":\"$REPO/wt-real-T004295\",\"branch\":\"feat/batch-demo-T004295\",\"label\":\"dead\"}" > "$AGENT_LOCK_DIR/batch__dead.json"

  # Lock 2: live lock on other worktree
  echo "{\"owner_sid\":\"$SID\",\"owner_pid\":\"5678\",\"worktree\":\"$REPO/wt-other\",\"branch\":\"feature/other-T009999\",\"label\":\"live\"}" > "$AGENT_LOCK_DIR/other__live.json"

  # SUT
  GUARD="$REPO_ROOT/scripts/hooks/worktree-write-guard.sh"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "Test 1: fremde-sid claim on wt-other -> status == 2" {
  export AGENT_LOCK_SID="fremde-sid"
  local TARGET="$REPO/wt-other/README.md"
  
  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"
  
  [ "$status" == 2 ]
}

@test "Test 2: own claims on wt-real -> status == 0" {
  # AGENT_LOCK_SID is sid-p6-test from setup
  # Target is wt-real/README.md. 
  # The lock exists for wt-real-T004295, but the target is wt-real.
  # SUT should normalize wt-real-T004295 -> wt-real and permit.
  
  local TARGET="$REPO/wt-real/README.md"
  
  run bash "$GUARD" <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$TARGET")"
  
  [ "$status" == 0 ]
}
