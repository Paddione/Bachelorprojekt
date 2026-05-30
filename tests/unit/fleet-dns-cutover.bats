#!/usr/bin/env bats
# Unit tests for the fleet DNS cutover mechanism.

setup() {
  load 'lib/bats-support/load'
  load 'lib/bats-assert/load'
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "fleet-mentolder env pins livekit/turn to pk-hetzner-4 (not gekko)" {
  run grep -E 'LIVEKIT_PIN_IP|TURN_PUBLIC_IP' "$REPO_ROOT/environments/fleet-mentolder.yaml"
  assert_success
  assert_output --partial '204.168.244.104'
  refute_output --partial '46.225.125.59'
  refute_output --partial '178.104.169.206'
}
