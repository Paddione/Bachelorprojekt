#!/usr/bin/env bats
#
# SSOT-Guardrail [T014936]: Die Queue-Wahrheit (was dispatcht die Factory?)
# lebt ausschließlich in scripts/factory/queue.sh. Der factory-mcp Go-Server
# (scripts/factory/mcp-go/main.go) exec't dieses Skript statt eigenes SQL zu
# pflegen. Am 2026-08-23 waren MCP-Anzeige und Dispatch-Query ohne Gates
# auseinandergedriftet (MCP meldete 12 Backlog, dispatchbar waren 0) und der
# tote Legacy-Node-Server (mcp-server.mjs) wurde fast als live gelesen und
# gefixt. Dieser Test fällt aus, sobald eines von beidem zurückkehrt.

@test "T014936: mcp-go bezieht Status/Queue aus queue.sh (SSOT-Wiring vorhanden)" {
  run grep -q 'factory/queue.sh' scripts/factory/mcp-go/main.go
  [ "$status" -eq 0 ]
}

@test "T014936: mcp-go dupliziert KEINE Queue-Lane-SQL mehr" {
  # Das war das Drift-Duplikat: ungefilterte backlog/plan_staged-Liste neben queue.sh.
  run grep -F "status IN ('backlog','plan_staged')" scripts/factory/mcp-go/main.go
  [ "$status" -ne 0 ]
}

@test "T014936: Positiv-Anker — queue.sh trägt weiterhin beide Gates" {
  run grep -c "factory_excluded" scripts/factory/queue.sh
  [ "$output" -ge 2 ]
}

@test "T014936: Legacy-Node-Server ist gelöscht (keine zweite Schnittstelle auf :13003)" {
  [ ! -f scripts/factory/mcp-server.mjs ]
}
