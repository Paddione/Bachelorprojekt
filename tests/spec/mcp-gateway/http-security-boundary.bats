#!/usr/bin/env bats
# tests/spec/mcp-gateway/http-security-boundary.bats
# SSOT: openspec/specs/mcp-gateway.md (Delta: openspec/changes/mcp-http-origin-auth-hardening)
# Ticket: T900052
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert. Ein
# minimaler echter HTTP-Listener bindet die gemeinsame Sicherheitsgrenze
# (scripts/lib/mcp-http-security.mjs) und jeder Test prueft Status + Header per
# curl - kein Grep gegen den Quelltext. Der Dispatcher ist ein Fragmentzaehler:
# ein abgelehnter Request darf ihn NICHT erschuettern (fail-closed vor Body/Route).
#
# Kein Datenbank-/Cluster-/Browser-/Secret-Zugriff (Design D7: policy behavior
# testable without them). Ports kommen aus einem freien Bereich; der Listener
# laeuft nur fuer die Dauer des Tests.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  MODULE="$REPO/scripts/lib/mcp-http-security.mjs"
  PORT=""
  for candidate in $(seq 19810 19840); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      PORT="$candidate"
      break
    fi
  done
  [ -n "$PORT" ] || skip "kein freier Port im Bereich 19810-19840"
}

teardown() {
  if [ -n "${SRV_PID:-}" ]; then
    kill "$SRV_PID" >/dev/null 2>&1 || true
    wait "$SRV_PID" 2>/dev/null || true
    SRV_PID=""
  fi
}

# start_boundary <token> [origins] - startet den Fixture-Listener der Grenze auf
# $PORT. dispatches: zaehlt erreichte Dispatcher-Aufrufe nach <port>/hits.
start_boundary() {
  local token="$1"
  local origins="$2"
  local script="$BATS_TEST_DIRNAME/http-security-boundary-server.mjs"
  BND_MODULE="$MODULE" BND_TOKEN="$token" BND_ORIGINS="$origins" BND_PORT="$PORT" node "$script" >/dev/null 2>&1 &
  SRV_PID=$!
  local up=""
  for _ in $(seq 1 50); do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/hits" 2>/dev/null; then up=yes; break; fi
    sleep 0.1
  done
  [ -n "$up" ] || { kill "$SRV_PID" 2>/dev/null || true; skip "Boundary-Listener auf $PORT nicht hoch" }
}

post_rpc() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT}/mcp" \
    -H 'content-type: application/json' "$@"
}

@test "http-security: no-Origin CLI request with valid bearer is allowed and dispatches" {
  start_boundary "secret-token"
  code="$(post_rpc -H "Authorization: Bearer secret-token" -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "200" ]
  [ "$(curl -s "http://127.0.0.1:${PORT}/hits")" = "1" ]
}

@test "http-security: exact allowed browser Origin with valid bearer is allowed" {
  start_boundary "secret-token" '["https://app.example.com"]'
  code="$(post_rpc -H "Authorization: Bearer secret-token" -H "Origin: https://app.example.com" \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "200" ]
}

@test "http-security: foreign browser Origin is rejected before dispatch (403)" {
  start_boundary "secret-token" '["https://app.example.com"]'
  code="$(post_rpc -H "Authorization: Bearer secret-token" -H "Origin: https://evil.example.com" \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "403" ]
  [ "$(curl -s "http://127.0.0.1:${PORT}/hits")" = "0" ]
}

@test "http-security: malformed Origin is rejected (403), never treated as absent" {
  start_boundary "secret-token" '["https://app.example.com"]'
  code="$(post_rpc -H "Authorization: Bearer secret-token" -H "Origin: not-a-url" \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "403" ]
  [ "$(curl -s "http://127.0.0.1:${PORT}/hits")" = "0" ]
}

@test "http-security: invalid Host (DNS-rebinding) is rejected before dispatch (403)" {
  start_boundary "secret-token"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT}/mcp" \
    -H 'Host: evil.example.com' -H "Authorization: Bearer secret-token" \
    -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "403" ]
  [ "$(curl -s "http://127.0.0.1:${PORT}/hits")" = "0" ]
}

@test "http-security: missing bearer token is rejected (401) without dispatch" {
  start_boundary "secret-token"
  code="$(post_rpc -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "401" ]
  [ "$(curl -s "http://127.0.0.1:${PORT}/hits")" = "0" ]
}

@test "http-security: wrong token is rejected (401) without dispatch" {
  start_boundary "secret-token"
  code="$(post_rpc -H "Authorization: Bearer wrong-token" -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "401" ]
  [ "$(curl -s "http://127.0.0.1:${PORT}/hits")" = "0" ]
}

@test "http-security: unequal-length token is rejected (401) without dispatch" {
  start_boundary "secret-token"
  code="$(post_rpc -H "Authorization: Bearer x" -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "401" ]
  [ "$(curl -s "http://127.0.0.1:${PORT}/hits")" = "0" ]
}

@test "http-security: OPTIONS preflight from allowed origin passes; foreign origin denied" {
  start_boundary "secret-token" '["https://app.example.com"]'
  ok="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "http://127.0.0.1:${PORT}/mcp" \
    -H "Origin: https://app.example.com" -H "Access-Control-Request-Method: POST")"
  [ "$ok" = "204" ]
  denied="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "http://127.0.0.1:${PORT}/mcp" \
    -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: POST")"
  [ "$denied" = "403" ]
}
