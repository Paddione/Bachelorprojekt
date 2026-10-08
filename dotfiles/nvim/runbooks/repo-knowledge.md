---
page: repo-knowledge
ticket: T901050
status: complete
actions:
  - symbol-search
  - call-graph
  - architecture-layers
  - code-snippet
  - semantic-search
---

## Voraussetzungen

- K3-Graph: MCP-Server `codebase-memory-mcp` (Harness-seitig
  konfiguriert; Bridge http://127.0.0.1:18235, Webview
  http://127.0.0.1:9749). Es gibt kein Shell-CLI — Aufrufform ist der
  MCP-Tool-Call (siehe Schritte).
- Referenz: `docs/brain/k3-code-graph.md`.
- Semantik braucht das Backend http://127.0.0.1:1234 (sonst Guard-Meldung).

## Geordnete Schritte

1. **symbol-search**: Pattern eingeben — Aktion zeigt die verifizierte
   Aufrufform `search_graph` mit `name_pattern="<pattern>"`.
2. **call-graph**: Funktion eingeben — Aufrufform `trace_path` mit
   `function_name` und Richtung inbound/outbound.
3. **architecture-layers**: Aktion zeigt die Aufrufform `get_architecture`.
4. **code-snippet**: Qualifizierten Namen eingeben — Aufrufform
   `get_code_snippet`.
5. **semantic-search**: Nur bei erreichbarem Backend (`bge_embed` via
   Harness-bge-mcp); sonst klare Meldung "backend not reachable" statt
   toter Aktion.

## Erwartetes Ergebnis

Vier Graph-Aktionen in verifizierter Aufrufform; Semantik mit
Backend-Guard; keine Verweise auf abgeschaffte Pfade.

## Troubleshooting

- **Bridge unerreichbar**: Daemon/Cron-Status pruefen
  (`scripts/cbm-refresh-cron.sh`); Webview :9749 als Alternative.
- **Semantik meldet Backend fehlt**: LM-Link-Backend pruefen, sonst
  K3-Symbol-Suche nutzen.

## Recovery

Keine: alle Aktionen sind lesend.
