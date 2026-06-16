#!/usr/bin/env bats
# Tests for scripts/agent-msg.sh — lightweight inter-agent message channel. [T000882]
#
# Storage = append-only JSONL under the git-common-dir; per-SID read cursor.
# Tests override storage via AGENT_MSG_DIR and identity via AGENT_LOCK_SID, so no
# real .git is required. Fixtures live in $BATS_TMPDIR (CLAUDE.md Dev-Rule #8).

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../scripts/agent-msg.sh"
  TMP="$(mktemp -d "${BATS_TMPDIR:-/tmp}/agent-msg.XXXXXX")"
  export AGENT_MSG_DIR="$TMP/msgs"
}

teardown() { rm -rf "$TMP"; }

_post() {
  local sid="$1"; shift
  AGENT_LOCK_SID="$sid" bash "$HELPER" post "$@"
}
_read() {
  local sid="$1"; shift
  AGENT_LOCK_SID="$sid" bash "$HELPER" read "$@"
}

@test "post → read roundtrip" {
  _post 1111 "hello world"
  run _read 2222
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'hello world'
}

@test "--unread delivers each message exactly once per SID" {
  _post 1111 "first"
  _post 1111 "second"
  run _read 2222 --unread
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'first'
  echo "$output" | grep -q 'second'
  run _read 2222 --unread
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "--unread cursor is per-SID (independent readers)" {
  _post 1111 "broadcast-msg"
  run _read 2222 --unread; echo "$output" | grep -q 'broadcast-msg'
  run _read 3333 --unread
  echo "$output" | grep -q 'broadcast-msg'
}

@test "directed --to is delivered only to the target via --mine" {
  _post 1111 "for two" --to 2222
  run _read 2222 --mine; [ "$status" -eq 0 ]; echo "$output" | grep -q 'for two'
  run _read 3333 --mine; [ "$status" -eq 0 ]; ! echo "$output" | grep -q 'for two'
}

@test "broadcast (no --to) reaches everyone via --mine" {
  _post 1111 "all hands"
  run _read 9999 --mine; [ "$status" -eq 0 ]; echo "$output" | grep -q 'all hands'
}

@test "text over 4 KB is truncated and warns on stderr" {
  big="$(printf 'x%.0s' $(seq 1 5000))"
  run _post 1111 "$big"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi 'truncat'
  len="$(jq -r '.text | length' "$AGENT_MSG_DIR/log.jsonl")"
  [ "$len" -le 4096 ]
}

@test "tail prints human-readable lines" {
  _post 1111 "line one"
  run bash "$HELPER" tail -n 1
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'line one'
}
