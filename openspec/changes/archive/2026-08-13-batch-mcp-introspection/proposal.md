# Proposal: batch-mcp-introspection

## Why

Die MCP-Introspektionswerkzeuge (ticket-mcp, mcp-postgres, factory-mcp) lieferten
unvollständige oder unbrauchbare Triage-Daten. Sechs Folgetickets dokumentierten
konkrete Lücken: unvollständige list-Projektion (T003406), Cluster-interne
Such-URL als Default (T003232), factory_ask-Timeout über dem Client-Timeout
(T003803), falsch benannte Zeit-Spalte in Introspect-Queries (T003804),
truncated Triage-Query (T003800) und eine stillgelegte Fleet-Kopie (T003405).
Zwei Befunde sind obsolet (T003800: reine Client-Seiten-Cap; T003405: Fleet-Kopie
retired), drei hinterlassen echte Code-Lücken, die dieser Batch schließt.

## What

- `ticket.sh list` (und damit `list_tickets`/`export_tickets`) projiziert alle
  Triage-Felder: `component`, `areas`, `depends_on`, `readiness`, `effort`,
  `planning_rank`, `desc_len`, `updated_at` — additiv, bestehende Konsumenten
  bleiben unberührt.
- Alle drei `OPENSPEC_SEARCH_URL`-Konsumenten (factory-mcp Go, Legacy-Node-Server,
  `plan-context.sh`) defaulten auf `http://localhost:4321` statt Cluster-DNS.
- `factory_ask` nutzt eine benannte Konstante `factoryAskTimeout = 45s`, strikt
  unter dem ~60s-Client-Timeout.
- Guard-Tests sichern alle drei Fixes plus die `at`-Spalte von
  `factory_phase_events` gegen Regression.

_Ticket: T003811_
