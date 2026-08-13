#!/usr/bin/env bats
#
# SSOT: openspec/changes/batch-mcp-introspection (T003811, Batch-Parent)
# Ticket: T003232 — openspec_find_similar: Cluster-interne URL als Default; MCP-Clients
# ausserhalb des Clusters (lokal, opencode) bekommen keine Antwort
#
# PRUEFMODUS: Querschnittstest (T002448-M4-Ausnahme). Das Ergebnis manifestiert sich
# ausschliesslich im Quelltext: der Default-Wert der OpenSpec-Such-URL in den drei
# Konsumenten (factory-mcp Go-Server, Legacy-Node-Server, plan-context.sh). Geprueft
# wird die Semantik des Defaults (localhost statt svc.cluster.local), nicht dessen
# Darstellung — Substring-Proben ohne Zeilenanker (T002716).
#
# Positiv-Anker (T002356-M1): task-context.sh traegt bereits den lokalen Default —
# der Anker beweist, dass das Suchmuster den Fix-Zustand erkennt und dass lokal
# konsistent gebaut wird. Er faellt nicht aus, wenn der Defekt zurueckkehrt.

@test "T003232: factory-mcp Go-Server defaultet OPENSPEC_SEARCH_URL auf localhost:4321" {
  run grep -e 'envOr("OPENSPEC_SEARCH_URL"' scripts/factory/mcp-go/main.go
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'http://localhost:4321'
  printf '%s\n' "$output" | grep -qvF 'svc.cluster.local'
}

@test "T003232: Legacy-Node-Server (mcp-server.mjs) defaultet auf localhost:4321" {
  run grep -e 'OPENSPEC_SEARCH_URL' scripts/factory/mcp-server.mjs
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'http://localhost:4321'
  printf '%s\n' "$output" | grep -qvF 'svc.cluster.local'
}

@test "T003232: plan-context.sh defaultet auf localhost:4321" {
  run grep -e 'OPENSPEC_SEARCH_URL' scripts/plan-context.sh
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'http://localhost:4321'
  printf '%s\n' "$output" | grep -qvF 'svc.cluster.local'
}

@test "T003232: Positiv-Anker — task-context.sh baut lokal (localhost-Default vorhanden)" {
  run grep -e 'OPENSPEC_SEARCH_URL' scripts/task-context.sh
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'http://localhost:4321'
}
