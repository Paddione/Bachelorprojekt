#!/usr/bin/env bats
# tests/spec/agent-lock-force-claim.bats
# RED/GREEN for claim --force (T002454)

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
  unset CLAUDE_CODE_SESSION_ID
  export CLAUDE_SESSION_ID="claude-t002454-suite"
  unset AGENT_LOCK_SID
}

teardown() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
}

@test "T002454-F1: claim --force uebernimmt Lock mit toter owner_pid" {
  AGENT_LOCK_SID="dead-session" AGENT_LOCK_FAKE_ALIVE="" \
    bash "$LOCK" claim ticket T002454-f1 --label old-session
  [ -f "$AGENT_LOCK_DIR/ticket__T002454-f1.json" ]
  sed -i 's/"owner_pid": *"[^"]*"/"owner_pid": "999999"/' "$AGENT_LOCK_DIR/ticket__T002454-f1.json"
  AGENT_LOCK_SID="new-session" \
    run bash "$LOCK" claim ticket T002454-f1 --force --label new-session
  [ "$status" -eq 0 ]
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T002454-f1.json")
  [ "$owner" = "new-session" ]
}

@test "T002454-F2: claim --force lehnt ab wenn owner_pid lebt" {
  AGENT_LOCK_FAKE_ALIVE="alive-session" AGENT_LOCK_SID="alive-session" \
    bash "$LOCK" claim ticket T002454-f2 --label old-session
  [ -f "$AGENT_LOCK_DIR/ticket__T002454-f2.json" ]
  sed -i 's/"owner_pid": *"[^"]*"/"owner_pid": "1"/' "$AGENT_LOCK_DIR/ticket__T002454-f2.json"
  AGENT_LOCK_SID="new-session" \
    run bash "$LOCK" claim ticket T002454-f2 --force --label new-session
  [ "$status" -eq 1 ]
  [[ "$output" == *"claim --force abgelehnt"* ]]
  owner=$(sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' "$AGENT_LOCK_DIR/ticket__T002454-f2.json")
  [ "$owner" = "alive-session" ]
}

@test "T002454-F3: .reap.log enthaelt claim-force Eintrag" {
  AGENT_LOCK_FAKE_ALIVE="" AGENT_LOCK_SID="dead-session" \
    bash "$LOCK" claim ticket T002454-f3 --label old
  [ -f "$AGENT_LOCK_DIR/ticket__T002454-f3.json" ]
  sed -i 's/"owner_pid": *"[^"]*"/"owner_pid": "999999"/' "$AGENT_LOCK_DIR/ticket__T002454-f3.json"
  AGENT_LOCK_SID="new-session" \
    bash "$LOCK" claim ticket T002454-f3 --force --label new
  run cat "$AGENT_LOCK_DIR/.reap.log"
  [[ "$output" == *"claim-force"* ]]
  [[ "$output" == *"ticket/T002454-f3"* ]]
}

@test "T002454-F4: claim ohne --force weist fremden Lock ab (Regression)" {
  AGENT_LOCK_SID="session-A" \
    bash "$LOCK" claim ticket T002454-f4 --label first
  [ -f "$AGENT_LOCK_DIR/ticket__T002454-f4.json" ]
  AGENT_LOCK_SID="session-B" \
    run bash "$LOCK" claim ticket T002454-f4 --label second
  [ "$status" -eq 1 ]
  [[ "$output" == *"bereits gehalten"* ]]
}
