#!/usr/bin/env bats
# Unit tests for the fleet DNS cutover mechanism.

setup() {
  load 'lib/bats-support/load'
  load 'lib/bats-assert/load'
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "fleet-mentolder env pins TURN_PUBLIC_IP to pk-hetzner-4 (not gekko)" {
  run grep -E 'TURN_PUBLIC_IP' "$REPO_ROOT/environments/fleet-mentolder.yaml"
  assert_success
  assert_output --partial '204.168.244.104'
  refute_output --partial '46.225.125.59'
  refute_output --partial '178.104.169.206'
}

@test "plan: mentolder change set is A-records only, allowlisted prefixes, correct IPs" {
  run env PROD_DOMAIN=mentolder.de STREAM_PIN_IP=204.168.244.104 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  assert_output --partial 'A|@|204.168.244.104'
  assert_output --partial 'A|@|37.27.251.38'
  assert_output --partial 'A|@|62.238.23.79'
  assert_output --partial 'A|*|62.238.23.79'
  assert_output --partial 'A|stream|204.168.244.104'
  assert_output --partial 'A|turn|204.168.244.104'
}

@test "plan: change set NEVER contains mail or non-A records" {
  run env PROD_DOMAIN=mentolder.de STREAM_PIN_IP=204.168.244.104 \
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
  run env PROD_DOMAIN=korczewski.de STREAM_PIN_IP=37.27.251.38 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  assert_output --partial 'A|stream|37.27.251.38'
  assert_output --partial 'A|@|204.168.244.104'
}

@test "fails loudly when required env vars are missing" {
  run env -u PROD_DOMAIN \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_failure
  assert_output --partial 'not set'
}

# Helper: a fake curl that logs every invocation to $CURL_LOG and prints a
# canned ipv64 get_domains response when asked to read records.
_make_fake_curl() {
  FAKE_BIN="$(mktemp -d)"
  CURL_LOG="$(mktemp)"
  cat > "$FAKE_BIN/curl" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$CURL_LOG"
if printf '%s\n' "\$@" | grep -q 'get_domains'; then
  cat "$FIXTURE_GET_DOMAINS"
fi
exit 0
EOF
  chmod +x "$FAKE_BIN/curl"
}

@test "cutover: issues only type=A ipv64 writes for allowlisted prefixes" {
  _make_fake_curl
  FIXTURE_GET_DOMAINS="$(mktemp)"; echo '{"record_info":[]}' > "$FIXTURE_GET_DOMAINS"
  run env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" cutover
  assert_success
  run grep -E 'type=MX|type=TXT|type=CNAME' "$CURL_LOG"
  assert_failure
}

@test "cutover: writes a rollback state file" {
  _make_fake_curl
  FIXTURE_GET_DOMAINS="$(mktemp)"; echo '{"record_info":[]}' > "$FIXTURE_GET_DOMAINS"
  env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" cutover
  [ -f "$BATS_TEST_TMPDIR/fleet-dns-rollback-mentolder.de.state" ]
}

@test "rollback: restores exactly the recorded state lines" {
  _make_fake_curl
  cat > "$BATS_TEST_TMPDIR/fleet-dns-rollback-mentolder.de.state" <<'STATE'
A|@|46.225.125.59
A|livekit|46.225.125.59
STATE
  run env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" rollback
  assert_success
  run grep -F 'content=46.225.125.59' "$CURL_LOG"
  assert_success
}

@test "rollback: fails loudly when no state file exists" {
  _make_fake_curl
  run env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" rollback
  assert_failure
  assert_output --partial 'no rollback state'
}

@test "Taskfile declares fleet:dns:cutover and fleet:dns:rollback" {
  run grep -E '^[[:space:]]+fleet:dns:(cutover|rollback):' "$REPO_ROOT/Taskfile.yml"
  assert_success
  assert_output --partial 'fleet:dns:cutover:'
  assert_output --partial 'fleet:dns:rollback:'
}

@test "fleet:shared-services uses office.* hosts not collabora.* for Collabora" {
  # Collabora ingress host must be office.<domain> so Nextcloud public_wopi_url resolves.
  run grep -A 25 'fleet:shared-services:' "$REPO_ROOT/Taskfile.yml"
  assert_success
  assert_output --partial 'COLLABORA_HOST="office.'
  refute_output --partial 'COLLABORA_HOST="collabora.'
}

@test "fleet:shared-services aliasgroup references files.* not cloud.*" {
  # WOPI aliasgroup must match the Nextcloud host (files.<domain>), not cloud.*.
  run grep -A 25 'fleet:shared-services:' "$REPO_ROOT/Taskfile.yml"
  assert_success
  # Taskfile uses double-backslash (YAML literal block → envsubst escaping)
  assert_output --partial 'ALIASGROUP1="https://files\\'
  refute_output --partial 'ALIASGROUP1="https://cloud\\'
}
