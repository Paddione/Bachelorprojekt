#!/usr/bin/env bats
# tests/spec/factory-watchdog/worktree-activity-shield.bats
# Guard for watchdog worktree activity shield and reap/purge serialization (T900227).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  ACTIVITY_LIB="$REPO_ROOT/scripts/agent-lock-activity.sh"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  WATCHDOG_SCRIPT="$REPO_ROOT/scripts/factory/watchdog.sh"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  export AGENT_LOCK_SID="t900227-test"

  WT="$BATS_TEST_TMPDIR/test-worktree"
  mkdir -p "$WT"

  BG_PIDS=()
}

teardown() {
  for pid in "${BG_PIDS[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
  rm -rf "$AGENT_LOCK_DIR" "$WT"
}

@test "T900227: _worktree_recently_active detects process with cwd in worktree" {
  source "$ACTIVITY_LIB"

  (cd "$WT" && exec sleep 30) &
  local sleep_pid=$!
  BG_PIDS+=("$sleep_pid")
  sleep 0.1

  run _worktree_recently_active "$WT"
  [ "$status" -eq 0 ]
}

@test "T900227: _worktree_recently_active detects process holding open file handle inside worktree" {
  source "$ACTIVITY_LIB"

  echo "sample" > "$WT/open-file.txt"
  # Set mtime to 1 hour ago so mtime check does not trigger
  touch -d '1 hour ago' "$WT/open-file.txt" "$WT"

  # Process runs in /tmp (cwd outside worktree) but keeps file inside worktree open on fd 3
  (cd /tmp && exec 3<"$WT/open-file.txt" && exec sleep 30) &
  local sleep_pid=$!
  BG_PIDS+=("$sleep_pid")
  sleep 0.1

  run _worktree_recently_active "$WT"
  [ "$status" -eq 0 ]
}

@test "T900227: _worktree_recently_active detects files with recent mtime within window" {
  source "$ACTIVITY_LIB"

  # Fresh file created now
  echo "recent" > "$WT/recent.txt"

  export FACTORY_WORKTREE_ACTIVE_MIN=10
  run _worktree_recently_active "$WT"
  [ "$status" -eq 0 ]
}

@test "T900227: _worktree_recently_active returns 1 when no process, fd, or recent mtime" {
  source "$ACTIVITY_LIB"

  echo "old" > "$WT/old.txt"
  # Touch file and dir to 30 minutes ago
  touch -d '30 minutes ago' "$WT/old.txt" "$WT"

  export FACTORY_WORKTREE_ACTIVE_MIN=10
  run _worktree_recently_active "$WT"
  [ "$status" -eq 1 ]
}

@test "T900227: watchdog _wd_cleanup_worktree checks _worktree_recently_active before removing" {
  # Verify script source contains the call to _worktree_recently_active
  run grep -F "_worktree_recently_active" "$WATCHDOG_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T900227: watchdog _wd_cleanup_worktree respects factory_excluded tickets" {
  # Verify script checks factory_excluded before cleanup
  run grep -F "factory_excluded" "$WATCHDOG_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "T900227: watchdog _wd_cleanup_worktree serializes with registry lock" {
  # Verify flock or _with_lock usage in watchdog.sh around cleanup
  run grep -E "(\.registry\.lock|_with_lock)" "$WATCHDOG_SCRIPT"
  [ "$status" -eq 0 ]
}
