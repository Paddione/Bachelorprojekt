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

@test "plan: mentolder change set is A-records only, allowlisted prefixes, correct IPs" {
  run env PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  assert_output --partial 'A|@|204.168.244.104'
  assert_output --partial 'A|@|37.27.251.38'
  assert_output --partial 'A|@|62.238.23.79'
  assert_output --partial 'A|*|62.238.23.79'
  assert_output --partial 'A|livekit|204.168.244.104'
  assert_output --partial 'A|stream|204.168.244.104'
  assert_output --partial 'A|turn|204.168.244.104'
}

@test "plan: change set NEVER contains mail or non-A records" {
  run env PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  refute_output --partial 'MX'
  refute_output --partial 'TXT'
  refute_output --partial 'CNAME'
  refute_output --partial 'mailbox'
  refute_output --partial 'tutanota'
  refute_output --partial '_dmarc'
  refute_output --partial '_domainkey'
  refute_output --partial 'mta-sts'
  refute_output --partial 'spf'
  while IFS= read -r line; do
    [[ "$line" == CHANGE:* ]] || continue
    [[ "${line#CHANGE: }" == A\|* ]] || { echo "non-A change: $line"; return 1; }
  done <<< "$output"
}

@test "plan: korczewski pins service subdomains to pk-hetzner-6" {
  run env PROD_DOMAIN=korczewski.de LIVEKIT_PIN_IP=37.27.251.38 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  assert_output --partial 'A|livekit|37.27.251.38'
  assert_output --partial 'A|@|204.168.244.104'
}

@test "fails loudly when required env vars are missing" {
  run env -u PROD_DOMAIN -u LIVEKIT_PIN_IP \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_failure
  assert_output --partial 'not set'
}
