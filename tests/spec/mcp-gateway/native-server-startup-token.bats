#!/usr/bin/env bats
# tests/spec/mcp-gateway/native-server-startup-token.bats
# SSOT: openspec/specs/mcp-gateway.md (Delta: openspec/changes/mcp-http-origin-auth-hardening)
# Ticket: T900052 — Task 2.4
#
# Jeder native HTTP-MCP-Server (factory-mcp-node, bge-mcp, mcp-postgres-local)
# muss den Start verweigern, wenn das Pflicht-Token fehlt oder leer ist.
# Der Shared Guard (mcp-http-security.mjs:requireToken) wirft beim
# Modul-Laden — der Prozess beendet sich, BEVOR ein Port gebunden wird.
#
# Die Port-Bindungs-Tests verwenden einen dynamisch freien Port (19850-19880),
# um Konflikte mit laufenden Diensten auf Default-Ports zu vermeiden.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
  command -v node >/dev/null 2>&1 || skip "node binary not installed"

  # Einen freien Port finden (wie http-security-boundary.bats)
  FREE_PORT=""
  for candidate in $(seq 19850 19880); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      FREE_PORT="$candidate"
      break
    fi
  done
  [ -n "$FREE_PORT" ] || skip "kein freier Port im Bereich 19850-19880"
}

# assert_no_port_bound <port> — prueft, dass kein Prozess auf dem Port laeuft.
assert_no_port_bound() {
  local port="$1"
  run curl -s -o /dev/null -w '%{http_code}' --max-time 1 "http://127.0.0.1:${port}/" 2>/dev/null
  # curl gibt "000" zurueck wenn kein Server da ist, oder einen HTTP-Code wenn einer laeuft
  [ "$output" = "000" ] || [ "$status" -ne 0 ]
}

# ---------------------------------------------------------------------------
# factory-mcp-node — FACTORY_MCP_TOKEN, Port via FACTORY_MCP_PORT
# ---------------------------------------------------------------------------

@test "factory-mcp-node: exits non-zero when FACTORY_MCP_TOKEN is absent" {
  run env -u FACTORY_MCP_TOKEN FACTORY_MCP_PORT="$FREE_PORT" node "$REPO/scripts/factory-mcp-node/server.mjs"
  [ "$status" -ne 0 ]
}

@test "factory-mcp-node: error message names FACTORY_MCP_TOKEN" {
  run env -u FACTORY_MCP_TOKEN FACTORY_MCP_PORT="$FREE_PORT" node "$REPO/scripts/factory-mcp-node/server.mjs"
  [[ "$output" == *"MCP-HTTPSEC: Pflicht-Token fehlt"* ]]
  [[ "$output" == *"FACTORY_MCP_TOKEN"* ]]
}

@test "factory-mcp-node: does not bind port when token is absent" {
  run env -u FACTORY_MCP_TOKEN FACTORY_MCP_PORT="$FREE_PORT" node "$REPO/scripts/factory-mcp-node/server.mjs"
  [ "$status" -ne 0 ]
  assert_no_port_bound "$FREE_PORT"
}

# ---------------------------------------------------------------------------
# bge-mcp — BGE_MCP_TOKEN, Port via BGE_MCP_PORT
# ---------------------------------------------------------------------------

@test "bge-mcp: exits non-zero when BGE_MCP_TOKEN is absent" {
  run env -u BGE_MCP_TOKEN BGE_MCP_PORT="$FREE_PORT" node "$REPO/scripts/bge-mcp/server.mjs"
  [ "$status" -ne 0 ]
}

@test "bge-mcp: error message names BGE_MCP_TOKEN" {
  run env -u BGE_MCP_TOKEN BGE_MCP_PORT="$FREE_PORT" node "$REPO/scripts/bge-mcp/server.mjs"
  [[ "$output" == *"MCP-HTTPSEC: Pflicht-Token fehlt"* ]]
  [[ "$output" == *"BGE_MCP_TOKEN"* ]]
}

@test "bge-mcp: does not bind port when token is absent" {
  run env -u BGE_MCP_TOKEN BGE_MCP_PORT="$FREE_PORT" node "$REPO/scripts/bge-mcp/server.mjs"
  [ "$status" -ne 0 ]
  assert_no_port_bound "$FREE_PORT"
}

# ---------------------------------------------------------------------------
# mcp-postgres-local — MCP_POSTGRES_TOKEN, Port via PORT
# ---------------------------------------------------------------------------

@test "mcp-postgres-local: exits non-zero when MCP_POSTGRES_TOKEN is absent" {
  run env -u MCP_POSTGRES_TOKEN PORT="$FREE_PORT" node "$REPO/scripts/mcp-gateway/mcp-postgres-local.mjs"
  [ "$status" -ne 0 ]
}

@test "mcp-postgres-local: error message names MCP_POSTGRES_TOKEN" {
  run env -u MCP_POSTGRES_TOKEN PORT="$FREE_PORT" node "$REPO/scripts/mcp-gateway/mcp-postgres-local.mjs"
  [[ "$output" == *"MCP-HTTPSEC: Pflicht-Token fehlt"* ]]
  [[ "$output" == *"MCP_POSTGRES_TOKEN"* ]]
}

@test "mcp-postgres-local: does not bind port when token is absent" {
  run env -u MCP_POSTGRES_TOKEN PORT="$FREE_PORT" node "$REPO/scripts/mcp-gateway/mcp-postgres-local.mjs"
  [ "$status" -ne 0 ]
  assert_no_port_bound "$FREE_PORT"
}
