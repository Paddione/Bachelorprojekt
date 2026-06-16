#!/usr/bin/env bats
# tests/unit/factory/mcp-server.bats — MCP server health endpoint test. [T000914]
# Tool endpoint tests require full MCP protocol handshake — tested via manual integration.

setup() {
  ORIG_REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  if [[ ! -d "${ORIG_REPO}/scripts/factory/node_modules/@modelcontextprotocol" ]]; then
    skip "scripts/factory/node_modules not installed (run npm install in scripts/factory/)"
  fi
  export FACTORY_REPO="${BATS_TMPDIR}/mock-repo"
  mkdir -p "$FACTORY_REPO/scripts/factory"
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

@test "mcp-server: /health reports server name" {
  _start_server
  _health_check
  result="$(curl -sS http://127.0.0.1:${FACTORY_MCP_PORT}/health)"
  [[ "$result" == *'"server":"factory-mcp"'* ]]
}
