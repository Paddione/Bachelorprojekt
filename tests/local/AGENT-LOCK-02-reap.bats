#!/usr/bin/env bats
# AGENT-LOCK-02: reap / staleness [T000510]

setup() {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_TTL=1800
  export AGENT_LOCK_GRACE=0
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
}
teardown() { rm -rf "$AGENT_LOCK_DIR"; }

@test "AGENT-LOCK-02a: reap removes a dead-sid lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  # sid 100 now considered dead (not in FAKE_ALIVE during reap)
  AGENT_LOCK_SID=999 AGENT_LOCK_FAKE_ALIVE="999" run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  [ ! -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-02b: reap removes a missing-worktree lock" {
  WT="$(mktemp -d)"
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim branch b1 --worktree "$WT"
  rmdir "$WT"
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="999" run bash "$LOCK" reap
  [ ! -f "$AGENT_LOCK_DIR/branch__b1.json" ]
}

@test "AGENT-LOCK-02c: reap keeps a live lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=999 AGENT_LOCK_FAKE_ALIVE="100 999" run bash "$LOCK" reap
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-02d: claim auto-reaps a dead foreign lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="200" run bash "$LOCK" claim ticket T1
  [ "$status" -eq 0 ]
  [ "$(sed -n 's/.*"owner_sid": *"\([0-9]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T1.json")" = "200" ]
}
