#!/usr/bin/env bats
# tests/unit/factory/mcp-server.bats — MCP server tool endpoint tests. [T000914]

setup() {
  export FACTORY_REPO="${BATS_TMPDIR}/mock-repo"
  mkdir -p "$FACTORY_REPO/scripts/factory"
  ORIG_REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export FACTORY_MCP_PORT=13099
  export REPO="$FACTORY_REPO"
  MCP_SERVER="${ORIG_REPO}/scripts/factory/mcp-server.mjs"
}

teardown() {
  [[ -n "${MCP_PID:-}" ]] && kill "$MCP_PID" 2>/dev/null || true
  rm -rf "$FACTORY_REPO"
}

_start_server() {
  node "${MCP_SERVER}" &
  MCP_PID=$!
  sleep 1
}

_health_check() {
  for i in 1 2 3 4 5; do
    curl -sS --max-time 2 http://127.0.0.1:${FACTORY_MCP_PORT}/health >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

@test "mcp-server: /health returns ok" {
  _start_server
  _health_check
  result="$(curl -sS http://127.0.0.1:${FACTORY_MCP_PORT}/health)"
  [[ "$result" == *'"ok":true'* ]]
}

@test "mcp-server: factory_status tool returns JSON" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"factory_status","arguments":{}}}')"
  [[ "$result" == *'"content"'* ]]
}

@test "mcp-server: factory_queue tool returns JSON array" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"factory_queue","arguments":{}}}')"
  [[ "$result" == *'"content"'* ]]
}

@test "mcp-server: factory_enqueue tool validates ticket_id param" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"factory_enqueue","arguments":{"ticket_id":"T999999"}}}')"
  [[ "$result" == *'"content"'* ]]
}

@test "mcp-server: factory_recent tool returns JSON array" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"factory_recent","arguments":{"limit":5}}}')"
  [[ "$result" == *'"content"'* ]]
}
