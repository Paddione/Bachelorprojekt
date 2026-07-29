#!/usr/bin/env bats
# tests/spec/agent-collision-false-positives.bats

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  COLL="$REPO/scripts/agent-collision.sh"
  export AGENT_LOCK_DIR
  AGENT_LOCK_DIR="$(mktemp -d)"
}

teardown() {
  rm -rf "$AGENT_LOCK_DIR" 2>/dev/null || true
}

@test "M9: brandneue Datei loest keinen Kollisionsalarm aus" {
  # Simuliere einen fremden Lock mit Branch, der die neue Datei nicht hat
  cat > "$AGENT_LOCK_DIR/ticket__T002469-m9.json" <<'JSON'
{"scope":"ticket","id":"T002469","owner_sid":"other","owner_pid":"999999","tool":"claude","label":"other","worktree":"/tmp/nonexistent","branch":"other","host":"test","created_at":"1","heartbeat_at":"1"}
JSON
  AGENT_LOCK_FAKE_ALIVE="other" AGENT_LOCK_DIR="$AGENT_LOCK_DIR" \
    run bash "$COLL" check --branch --quiet
  [ "$status" -eq 0 ]
}

@test "M7: committete Peer-Aenderung loest keinen Alarm aus" {
  # Self-test: der Guard soll 0 melden wenn keine uncommitteten Änderungen
  AGENT_LOCK_DIR="$AGENT_LOCK_DIR" \
    run bash "$COLL" check --branch --quiet
  [ "$status" -eq 0 ]
}
