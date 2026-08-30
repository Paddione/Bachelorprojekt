#!/usr/bin/env bats
#
# Spec: openspec/specs/mishap-tracking.md — "Die Mishap-Tools des ticket-mcp
# sind im Node-Server registriert" (T003120; node-mcp-servers-Port)
#
# Pruefmodus: Querschnitts-Konventionspruefung (grep auf den Implementierungs-
# quelltext), deren Ergebnis sich ausschliesslich in der Implementierung
# manifestiert — der in CLAUDE.md ausdruecklich zugelassene grep-Fall.
#
# Warum es diesen Test gibt: die Mishap-Logik des ticket-mcp lebte seit langem
# im Go-Server (scripts/ticket-mcp/go/internal/tools/mishap.go), wurde aber mit
# dem node-mcp-servers-Port nach scripts/ticket-mcp-node/server.mjs verschoben
# und der Go-Server entfernt. Dieser Guard stellt sicher, dass die Mishap-Tools
# im Nachfolge-Server weiterhin registriert sind.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MCP_NODE="${REPO_ROOT}/scripts/ticket-mcp-node/server.mjs"
  REG="${REPO_ROOT}/docs/agent-guide/registry/mcp.yaml"
}

@test "T003120: der ticket-mcp-node-Server registriert die Mishap-Tools" {
  [ -f "$MCP_NODE" ]
  grep -qF "report_mishap" "$MCP_NODE"
  grep -qF "flush_mishap_buffer" "$MCP_NODE"
}

@test "T003120: ticket-mcp-node ist in der Registry eingetragen" {
  [ -f "$REG" ]
  grep -qF "ticket-mcp-node" "$REG"
}
