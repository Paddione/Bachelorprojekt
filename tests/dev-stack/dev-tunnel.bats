#!/usr/bin/env bats
# tests/dev-stack/dev-tunnel.bats
# Open a sish reverse-SSH tunnel, hit it through the SSO gate with a
# Bearer token, verify the local server's marker comes back, then tear
# the tunnel down and verify the public URL stops responding.

setup() {
  : "${RUN_DEV_TESTS:?Gated tests — set RUN_DEV_TESTS=true to run}"
  : "${DEV_DOMAIN:?DEV_DOMAIN required}"
  : "${SISH_TUNNEL_KEY:?path to a private key listed in DEV_SISH_AUTHORIZED_KEYS required}"
  : "${KC_TEST_USER:?}"
  : "${KC_TEST_PASSWORD:?}"
  KC_TEST_CLIENT_ID="${KC_TEST_CLIENT_ID:-workspace-dev-test}"
  : "${KC_TEST_CLIENT_SECRET:?}"
  TUNNEL_NAME="bats-tunnel-$$"
  TUNNEL_PORT=18099
  AUTH="${AUTH_HOST:-auth.mentolder.de}"
}

teardown() {
  [[ -n "${SSH_PID:-}" ]] && kill "$SSH_PID" 2>/dev/null || true
  [[ -n "${PY_PID:-}"  ]] && kill "$PY_PID"  2>/dev/null || true
}

@test "dev-tunnel.1: round-trip through sish reaches local Python server" {
  echo "tunnel-ok-$$" > /tmp/tunnel-marker
  ( cd /tmp && python3 -m http.server "$TUNNEL_PORT" >/dev/null 2>&1 ) &
  PY_PID=$!
  sleep 2

  ssh -i "$SISH_TUNNEL_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -p 2222 -N -R "$TUNNEL_NAME:80:localhost:$TUNNEL_PORT" \
      tunnel@"$DEV_DOMAIN" &
  SSH_PID=$!
  sleep 3

  TOKEN=$(curl -sS -X POST "https://$AUTH/realms/workspace/protocol/openid-connect/token" \
    -d "client_id=$KC_TEST_CLIENT_ID" \
    -d "client_secret=$KC_TEST_CLIENT_SECRET" \
    -d "grant_type=password" \
    -d "username=$KC_TEST_USER" \
    -d "password=$KC_TEST_PASSWORD" | jq -r .access_token)
  [ -n "$TOKEN" ]

  run curl -sS -H "Authorization: Bearer $TOKEN" \
    "https://$TUNNEL_NAME.$DEV_DOMAIN/tunnel-marker"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "tunnel-ok-$$"
}

@test "dev-tunnel.2: closing the tunnel removes the route" {
  [[ -n "${SSH_PID:-}" ]] && kill "$SSH_PID"
  sleep 3
  run curl -sIo /dev/null -w "%{http_code}\n" "https://$TUNNEL_NAME.$DEV_DOMAIN/"
  [ "$status" -eq 0 ]
  case "$output" in
    404|502|503) ;;
    *) echo "Expected 404/502/503 after teardown, got: $output"; return 1 ;;
  esac
}
