#!/usr/bin/env bats
# SSOT: openspec/changes/agent-lock-liveness-heartbeat (T015822)
# Tests check REAL agent-lock.sh command output (claim/check/guard-precommit exit
# codes), not script source — same convention as pid-dead-worktree-match-T002849.
#
# RED→GREEN: a matching worktree+branch lock whose owner_pid is dead must NOT be
# reaped when a LIVE /proc-cwd process still occupies the worktree, and the
# precommit guard must refresh the heartbeat of this session's worktree locks.
# A missing/broken store must fail open (never block a commit).

setup() {
  # tests/spec/<file>.bats -> two levels up is the repo root (T015822: the
  # original three-level climb landed on .worktrees/ and every run died rc=127).
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"

  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"
  # Deterministic, non-numeric session id => _sid_alive() always true. This makes
  # block 0 (confirmed-alive SID) keep such own locks alive independently of any
  # live process, so the heartbeat + worktree-probe assertions can each be
  # isolated. (Tests that need a DEAD sid use a numeric 999999 owner_pid/sid.)
  export AGENT_LOCK_SID="t015822-test"
  export AGENT_LOCK_GRACE=5   # shrink grace so 30s-old claims reach the dead paths
  unset AGENT_LOCK_FAKE_ALIVE

  SLEEP_PID=""
  # A minimal real git worktree whose checked-out branch the lock will match
  # (exercises Block 0b "worktree+branch match" in _reapable).
  WT="$BATS_TEST_TMPDIR/fake-worktree"
  mkdir -p "$WT"
  git -C "$WT" init -q
  git -C "$WT" config user.email t@example.com
  git -C "$WT" config user.name test
  git -C "$WT" commit -q --allow-empty -m init
  git -C "$WT" checkout -q -b fix/demo-T015822
}

teardown() {
  [ -n "${SLEEP_PID:-}" ] && kill "$SLEEP_PID" 2>/dev/null || true
  rm -rf "${AGENT_LOCK_DIR}" "$WT"
}

# usage: _mk_lock <scope> <id> <pid> <age_secs> <owner_sid>
# Defaults to a lock matching the fake WT on branch fix/demo-T015822 (Block 0b).
_mk_lock() {
  local scope="$1" id="$2" pid="$3" age="$4" sid="$5" ts br wt
  ts=$(( $(date +%s) - age ))
  [ "$scope" = "main-checkout" ] && { wt=""; br=""; } || { wt="$WT"; br="fix/demo-T015822"; }
  cat > "$AGENT_LOCK_DIR/${scope}__${id}.json" <<EOF
{
  "scope": "$scope",
  "id": "$id",
  "owner_sid": "$sid",
  "owner_pid": "$pid",
  "tool": "claude",
  "label": "liveness-T015822",
  "worktree": "$wt",
  "branch": "$br",
  "ticket": "",
  "host": "testhost",
  "created_at": "$ts",
  "heartbeat_at": "$ts"
}
EOF
}

_now_field() { sed -n 's/.*"heartbeat_at": *"\([^"]*\)".*/\1/p' "$1"; }

# ---------------------------------------------------------------------------
# T1: dead owner_pid + matching worktree/branch + a LIVE /proc-cwd process in
#     the worktree => lock is KEPT (today: reaped as pid-dead → "free").
# ---------------------------------------------------------------------------
@test "T1: live process in worktree keeps a dead-pid matching lock from reaping" {
  _mk_lock ticket T015822-t1 4194303 30 999999   # dead pid+sid, age 30s > grace
  # Spawn a real process whose cwd is the claimed worktree. /proc/cwd-scan
  # (_worktree_has_active_process) must find it; it excludes only the caller's
  # own ancestor chain, so a sibling child is visible.
  ( cd "$WT" && exec sleep 30 ) & SLEEP_PID=$!
  sleep 1   # let it settle into the worktree cwd
  run bash "$AGENT_LOCK" check ticket T015822-t1
  # BEFORE fix: _reapable falls through to pid-dead -> "free" (rc 0).
  # AFTER  fix: probe finds the live process -> _reapable returns 1 -> not "free".
  [ "$output" != "free" ]
}

# ---------------------------------------------------------------------------
# T2: same layout, NO live process => still reaped (pid-dead). Regression guard.
# ---------------------------------------------------------------------------
@test "T2: dead-pid matching lock reaps without a live process (pid-dead)" {
  _mk_lock ticket T0015822-t2 4194303 30 999999
  run bash "$AGENT_LOCK" check ticket T0015822-t2
  [ "$output" = "free" ]
}

# ---------------------------------------------------------------------------
# T3: guard-precommit refreshes heartbeat_at of a worktree-matched own lock.
#     (BEFORE fix the guard never touched branch locks -> heartbeat stale.)
# ---------------------------------------------------------------------------
@test "T3: guard-precommit refreshes the heartbeat of a worktree-matched lock" {
  local wt_top br hb_before hb_after
  wt_top="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null)"
  br="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  # own lock, matching worktree (the real repo) + branch, non-numeric alive sid,
  # heartbeat 600s old (< TTL) -> survives cmd_reap via the sid-alive branch.
  cat > "$AGENT_LOCK_DIR/branch__heartbeat.json" <<EOF
{
  "scope": "branch",
  "id": "heartbeat",
  "owner_sid": "t015822-test",
  "owner_pid": "$$",
  "tool": "claude",
  "label": "heartbeat-T015822",
  "worktree": "$wt_top",
  "branch": "$br",
  "ticket": "",
  "host": "testhost",
  "created_at": "$(( $(date +%s) - 600 ))",
  "heartbeat_at": "$(( $(date +%s) - 600 ))"
}
EOF
  hb_before="$(_now_field "$AGENT_LOCK_DIR/branch__heartbeat.json")"
  run bash "$AGENT_LOCK" guard-precommit
  [ "$status" -eq 0 ]
  hb_after="$(_now_field "$AGENT_LOCK_DIR/branch__heartbeat.json")"
  # AFTER fix: _touch_own_worktree_heartbeats bumped heartbeat_at to ~now.
  # BEFORE fix: heartbeat unchanged -> hb_after == hb_before.
  [ "$hb_after" != "$hb_before" ]
}

# ---------------------------------------------------------------------------
# T4: a missing/broken lock store must never block the commit guard (fail-open).
# ---------------------------------------------------------------------------
@test "T4: guard-precommit fails open (rc=0) when the lock store is missing" {
  local missing="$BATS_TEST_TMPDIR/missing-store/.nosuch"
  AGENT_LOCK_DIR="$missing" run bash "$AGENT_LOCK" guard-precommit
  [ "$status" -eq 0 ]
}

# expected: FAIL (red) — T1 and T3 fail on the unmodified branch.
