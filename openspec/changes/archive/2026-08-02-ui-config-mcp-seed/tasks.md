---
title: "ui-config-mcp-seed — Implementation Plan"
ticket_id: T002544
domains: [llm, agents]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ui-config-mcp-seed — Implementation Plan

_Ticket: T002544_

Die MCP-Serverliste der llama-WebUI liegt im Browser-`localStorage` und ist damit an Origin und
Profil gebunden. Sie wird stattdessen serverseitig über `--ui-config-file` vorbelegt — generiert aus
`docs/agent-guide/registry/mcp.yaml`, mit dem Bearer-Token nur als `${BGE_MCP_TOKEN}`-Referenz in
der getrackten Vorlage. Ausschliesslich `gemma26-factory` erhält den Seed.

Design: `openspec/changes/ui-config-mcp-seed/proposal.md`

## File Structure

| Path | Ist | Budget |
|---|---|---|
| `scripts/llm/ui-config-seed.mjs` | 0 | 800 |
| `scripts/llm/ui-config-seed.test.mjs` | 0 | 800 |
| `scripts/llm/ui-config.template.json` | 0 | 200 |
| `scripts/llm-proxy/runner.mjs` | 123 | 677 |
| `scripts/llm/loadouts.json` | 182 | 200 |
| `docs/agent-guide/registry/mcp.yaml` | 353 | 200 |
| `tests/spec/local-llm-proxy/ui-config-seed.bats` | 0 | 300 |

## Tasks

- [x] Task 1 — Failing Test (RED)
- [x] Task 2 — Vorlage `scripts/llm/ui-config.template.json`
- [x] Task 3 — Generator `scripts/llm/ui-config-seed.mjs`
- [x] Task 4 — `runner.mjs`: `--ui-config-file` emittieren
- [x] Task 5 — `loadouts.json`: `uiConfigFile` an `gemma26-factory`
- [x] Task 6 — Registry: `browser_endpoint` für die Brücken-Server
- [x] Task 7 — Rendering beim Unit-Start
- [x] Task 8 — Integrationstest gegen `/props`
- [x] Task 9 — Finale Verifikation

