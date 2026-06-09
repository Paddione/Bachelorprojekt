#!/usr/bin/env bats
# helper-collab-headless.bats — prompt() is bypassable via ?who= URL param (T000542)
#
# When a headless/automated browser (Playwright MCP) navigates to the brainstorm board
# with ?who=<name>, the blocking window.prompt() must be skipped so screenshots can
# proceed without waiting 60s for an unhandled dialog.

load test_helper

RUNNER="${BATS_TEST_DIRNAME}/../scripts/helper-collab-mock-runner.mjs"

_run_mock() {
  node "$RUNNER" "$@"
}

_field() {
  local json="$1" key="$2"
  echo "$json" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))['$key']))"
}

@test "?who=AutoBot URL param skips prompt() and sets name (T000542)" {
  result=$(_run_mock "?who=AutoBot")
  who=$(_field "$result" "who")
  prompted=$(_field "$result" "promptCalled")
  [ "$who" = "AutoBot" ]
  [ "$prompted" = "false" ]
}

@test "no URL param and no cached name → prompt() IS called" {
  result=$(_run_mock "")
  prompted=$(_field "$result" "promptCalled")
  [ "$prompted" = "true" ]
}

@test "pre-set localStorage still skips prompt() after fix (regression guard)" {
  result=$(_run_mock "" "CachedUser")
  who=$(_field "$result" "who")
  prompted=$(_field "$result" "promptCalled")
  [ "$who" = "CachedUser" ]
  [ "$prompted" = "false" ]
}

@test "?who= value is trimmed to max 24 chars" {
  result=$(_run_mock "?who=AAAAABBBBBCCCCCDDDDDEEEEE")
  who=$(_field "$result" "who")
  [ "${#who}" -le 24 ]
}
