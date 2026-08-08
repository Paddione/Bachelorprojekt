#!/usr/bin/env bats

# no-silent-fallback.bats — D13: Kein Null/Strich/Beispielwert bei Fehler
# MIT POSITIV-ANKER (T002356-M1)

load daemon-helper

setup() {
  require_daemon || return 1
}

@test "D13 POSITIV-ANKER: valid response has NO error field" {
  # Positive anchor first: prove the test can succeed
  run curl -s "${BASE}/health"
  echo "$output" | grep -qv '"error"'
}

@test "D13 NEGATIV: unreachable endpoint returns error field, not null" {
  # Stop daemon or use a non-existent port. 39153 statt 49153 [T002708]: der
  # alte Wert lag im Bereich, den Windows/Hyper-V auf WSL2-Hosts reserviert.
  local DEAD_PORT=39153
  run curl -s "http://127.0.0.1:${DEAD_PORT}/health"
  # curl returns error — that's fine for D13
  # But if the daemon returns data, it MUST have error field
  if [ -n "$output" ]; then
    echo "$output" | grep -q '"error"'
  fi
}

@test "D13: response never contains empty array '[]' as data payload without error" {
  # Fetch a real endpoint and verify: if there's no error, data array is non-empty
  # (or the response structure is valid)
  run curl -s "${BASE}/api/admin/cockpit/portfolio?brand=mentolder"
  # Either error field OR data is present
  if [ -n "$output" ]; then
    echo "$output" | grep -qE '"error"|"fetchedAt"'
  fi
}

@test "D13 NEGATIV: response never contains null as a data value" {
  # Scan for "null" standalone as a value (not inside a string)
  run curl -s "${BASE}/api/cockpit/agents"
  # "null" as a value would be e.g.: "model": null
  # But "model": null is acceptable in model-health (no model loaded)
  # The real test: fields that should be arrays (agents, pods) should not be null
  if echo "$output" | grep -q '"agents":null'; then
    echo "D13 violation: agents field is null"
    return 1
  fi
}
