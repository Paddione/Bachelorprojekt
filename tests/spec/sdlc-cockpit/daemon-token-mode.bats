#!/usr/bin/env bats

# daemon-token-mode.bats — Token: 0600 Dateirechte, POST→401 ohne Token

setup() {
  TOKEN_FILE="/tmp/cockpit-daemon.token"
  DAEMON_PORT=${COCKPIT_DAEMON_PORT:-49152}
  BASE="http://127.0.0.1:${DAEMON_PORT}"
  if ! curl -s -m 2 "${BASE}/health" >/dev/null 2>&1; then
    skip "Daemon not running (no /health on ${BASE})"
  fi
}

@test "token file has 0600 permissions" {
  if [ ! -f "$TOKEN_FILE" ]; then
    skip "Daemon not running (no token file)"
  fi
  local perms=$(stat -c '%a' "$TOKEN_FILE" 2>/dev/null || echo "000")
  [ "$perms" = "600" ]
}

@test "token file is non-empty" {
  if [ ! -f "$TOKEN_FILE" ]; then
    skip "Daemon not running (no token file)"
  fi
  local size=$(stat -c '%s' "$TOKEN_FILE" 2>/dev/null || echo 0)
  [ "$size" -gt 0 ]
}

@test "POST without token returns 401" {
  run curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/cockpit/ticket-action" \
    -H "Content-Type: application/json" \
    -d '{"ticketId":"T002461","action":"test"}'
  [ "$output" = "401" ]
}

@test "POST with wrong token returns 401" {
  run curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/cockpit/ticket-action" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer wrong-token-12345" \
    -d '{"ticketId":"T002461","action":"test"}'
  [ "$output" = "401" ]
}

@test "GET without token succeeds (read is free per E17)" {
  run curl -s -o /dev/null -w "%{http_code}" "${BASE}/health"
  [ "$output" = "200" ]
}
