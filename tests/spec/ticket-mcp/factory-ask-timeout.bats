#!/usr/bin/env bats
#
# SSOT: openspec/changes/batch-mcp-introspection (T003811, Batch-Parent)
# Ticket: T003803 — factory_ask timeout: Server-Context (90s) groesser als das
# MCP-Client-Request-Timeout (~60s) — der Client bricht mit -32001 ab, bevor der
# Server antwortet
#
# PRUEFMODUS: Semantischer Wert-Check (T002716). Der Defekt sitzt in der Zeitkonstante
# des factory_ask-Handlers — sie manifestiert sich nur im Quelltext. Geprueft wird der
# WERT (45s < 60s Client-Limit), nicht die Darstellung: die Zahl wird formatfrei aus
# der Konstante extrahiert und arithmetisch verglichen. Ohne Konstante (leere
# Extraktion) schlaegt der Vergleich fehl — der Test ist damit ohne Implementierung
# rot (kein vakuoser Negativtest).
#
# Die 60s-Grenze ist die beobachtete Client-Semantik (MCP-JSON-RPC-Request-Timeout
# des MCP-Clients; Server-Timeout MUSS darunter liegen).

@test "T003803: factoryAskTimeout existiert und liegt unter dem Client-Timeout (60s)" {
  run grep -e 'factoryAskTimeout' scripts/factory/mcp-go/main.go
  [ "$status" -eq 0 ]

  # T003104-Lehre: die Extraktion muss auf die Definitionszeile eingrenzen
  # (const factoryAskTimeout = 45 …) — der erste Zufallstreffer im Dokument kann
  # in einem Kommentar liegen (hier: "// factoryAskTimeout: T003803 …") und wuerde
  # die Ticketnummer statt des Konstantenwerts extrahieren.
  val=$(printf '%s\n' "$output" | grep -oE 'const factoryAskTimeout[^0-9]*[0-9]+' | grep -oE '[0-9]+$' | head -1)
  [ -n "$val" ]
  [ "$val" -lt 60 ]
}

@test "T003803: factory_ask-Handler nutzt die Konstante (keine separate Zahl)" {
  run grep -e 'context.WithTimeout' scripts/factory/mcp-go/main.go
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'factoryAskTimeout'
}
