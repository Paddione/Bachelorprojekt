#!/usr/bin/env bats
# AGENT-LOCK-01: core claim/refresh/release/check [T000510]

setup() {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  export AGENT_LOCK_TTL=1800
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"
}
teardown() { rm -rf "$AGENT_LOCK_DIR"; }

@test "AGENT-LOCK-01a: claim succeeds when free" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" claim ticket T1 --label test
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-01b: foreign live claim is blocked" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" claim ticket T1
  [ "$status" -eq 1 ]
  [[ "$output" == *"bereits gehalten"* ]]
}

@test "AGENT-LOCK-01c: same-sid re-claim is idempotent" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" claim ticket T1
  [ "$status" -eq 0 ]
}

@test "AGENT-LOCK-01d: check exit codes free/mine/held" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" check ticket T1
  [ "$status" -eq 0 ]; [ "$output" = "free" ]
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" check ticket T1
  [ "$status" -eq 0 ]; [ "${lines[0]}" = "mine" ]
  AGENT_LOCK_SID=200 AGENT_LOCK_FAKE_ALIVE="100 200" run bash "$LOCK" check ticket T1
  [ "$status" -eq 3 ]; [ "${lines[0]}" = "held" ]
}

@test "AGENT-LOCK-01e: refresh bumps heartbeat for owner" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  hb1=$(sed -n 's/.*"heartbeat_at": *"\([0-9]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T1.json")
  sleep 1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" refresh ticket T1
  [ "$status" -eq 0 ]
  hb2=$(sed -n 's/.*"heartbeat_at": *"\([0-9]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T1.json")
  [ "$hb2" -ge "$hb1" ]
}

@test "AGENT-LOCK-01f: release frees the lock" {
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" bash "$LOCK" claim ticket T1
  AGENT_LOCK_SID=100 AGENT_LOCK_FAKE_ALIVE="100" run bash "$LOCK" release ticket T1
  [ "$status" -eq 0 ]
  [ ! -f "$AGENT_LOCK_DIR/ticket__T1.json" ]
}

@test "AGENT-LOCK-01g: mine prints the session id" {
  AGENT_LOCK_SID=777 run bash "$LOCK" mine
  [ "$status" -eq 0 ]; [ "$output" = "777" ]
}
