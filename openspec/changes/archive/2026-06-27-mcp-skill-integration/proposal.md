# Proposal: mcp-skill-integration

## Why

Die selbstgebauten MCP-Server und die Skills arbeiten nicht Hand in Hand — eine **Reife-Lücke**,
kein Integrationsproblem. Nur `mishap-tracker` ruft MCP-Tools tatsächlich auf; die
hochfrequenten Skills (`dev-flow-execute`: 17 `ticket.sh`-Aufrufe, `dev-flow-plan`: 7)
dokumentieren einen „MCP-Schnellweg" nur als Kommentar und führen ausschließlich den
`ticket.sh`/`kubectl exec psql`-Fallback aus.

Wurzelursache: Die `ticket-mcp`-Adapter-Fläche ist **unvollständig** — Verben wie `phase` (×9),
`grill` (×6), `stage-plan` (×4) und `create` (×4) haben kein MCP-Tool, also *müssen* Skills auf
`ticket.sh` zurückfallen. Verstärkt durch **Doppelpflege** (`ticket-mcp` existiert als Go- *und*
Node-Adapter, beide shellen nur zu `ticket.sh`) und **Drift** (`factory-mcp` ist nirgends
registriert; CLAUDE.md/AGENTS.md nennen nicht-existente opencode-Servernamen `mcp-k8s`/`mcp-factory`).

## What

Die MCP-Server zu einem **vollständigen 1:1-Adapter** über genau die Skript-Verben machen, die
Skills aufrufen, und die Skills **MCP-first** verdrahten (Skript bleibt dokumentierter Fallback).
Drei Slices → drei getrennte PRs:

- **Slice 1 — `ticket-mcp` Go-SSOT + Adapter-Fläche:** Auf Go konsolidieren (opencode auf
  `ticket-mcp-go` umstellen, Node-Adapter entfernen). Neun dünne Tool-Wrapper über bestehende
  `ticket.sh`-Verben ergänzen (`record_phase_event`, `record_grill_answers`, `stage_plan`,
  `create_ticket`, `enqueue_ticket`, `set_touched_files`, `get_attachments`, `archive_plan`,
  `add_pr_link`).
- **Slice 2 — Skills MCP-first:** `dev-flow-execute`, `dev-flow-plan`, `ticket-ops`,
  `incident-response`, `infra-ops` auf das `mishap-tracker`-Muster umstellen — MCP-Tool als
  primärer Pfad, Skript/kubectl als dokumentierter Fallback. Reads via `mcp-postgres`/
  `mcp-kubernetes`; Writes/DDL bleiben kubectl.
- **Slice 3 — Hygiene, SSOT-Doku, Guardrail:** `factory-mcp` als HTTP registrieren + in
  `ticket-ops`/`operations-management` verdrahten; CLAUDE.md/AGENTS.md-Drift korrigieren;
  `mcp-tool-guide.md` als Mapping-SSOT umschreiben (inkl. `task-master-ai` als optionales
  Werkzeug, `mcp-task-runner`); harter BATS-Guardrail `tests/spec/mcp-tooling.bats` gegen Re-Drift.

Vollständiger Kontext, Tool-Tabelle, Risiken und Nicht-Ziele:
`docs/superpowers/specs/2026-06-27-mcp-skill-integration-design.md`.

_Ticket: T001211_
