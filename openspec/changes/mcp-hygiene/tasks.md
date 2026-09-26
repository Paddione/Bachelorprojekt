---
title: "mcp-hygiene — Implementation Plan"
ticket_id: T900479
domains: [mcp, repo-hygiene]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-hygiene — Implementation Plan

_Ticket: T900479_ · Design: `openspec/changes/mcp-hygiene/design.md` ·
Delta: `specs/agentic-tooling-quality-goals.md` (G-AGENTIC11/G-AGENTIC13
Beispiel-Sweep, Orphan-Regel neu).

## File Structure

- `scripts/factory-mcp-node/server.mjs`, `scripts/factory-mcp-node/package.json` (p1, DEL)
- `tests/spec/mcp-gateway/native-server-startup-token.bats` (p1, Factory-Block raus)
- `tests/spec/mcp-gateway/token-drift-auto-sync.bats` (p1, Fixture umhängen)
- `tests/spec/llm-local-dev/glimmer-worker-mcp.bats` (p1, Fixture-URL umhängen)
- `scripts/mcp-sync.sh` (p1, factory-mcp-node-Referenzen raus)
- `docs/code-quality/gates.yaml` (p1, tote factory-Ignore-Einträge raus)
- `scripts/hermes-mcp-servers.yaml` (p2, Katalog-Sync mit Registry)
- `scripts/hermes-mcp-provision.sh` (p2, anfassen nur falls Sync es erfordert)
- `tests/spec/hermes-mcp-access.bats` (p2, Servermenge + Denylist + SSOT-Pointer)
- `docs/agent-guide/registry/expected/agy-mcp-config.json` (p2, tote Server raus)
- `docs/agent-guide/registry/capabilities.yaml` (p3, Kuration)
- `docs/agent-guide/registry/mcp.yaml` (p3, Kommentar + User-Scope-Notiz)
- `.claude/settings.json` (p3, zwei Plugin-Toggles)
- `.claude/skills/references/mcp-tool-guide.md` + `.opencode/skills/references/mcp-tool-guide.md` (p3, Warden-Abschnitt; Hardlink-Paar, Hinweis in p3)
- `docs/agent-guide/maps/toolset-map.md`, `docs/agent-guide/20-werkzeuge.md`, `components/website/src/lib/agent-guide.generated.json` (p3, GEN via Registry-Tasks)
- `tests/spec/software-factory/decommission-guard.bats` (p-tests, Abwesenheits-Assertions)
- `tests/spec/mcp-tooling.bats` (p-tests, Orphan-Guard neu)

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-retire-factory-mcp.md | impl | scripts/factory-mcp-node/server.mjs, scripts/factory-mcp-node/package.json, tests/spec/mcp-gateway/native-server-startup-token.bats, tests/spec/mcp-gateway/token-drift-auto-sync.bats, tests/spec/llm-local-dev/glimmer-worker-mcp.bats, scripts/mcp-sync.sh, docs/code-quality/gates.yaml | |
| p2 | tasks.d/p2-hermes-sweep.md | impl | scripts/hermes-mcp-servers.yaml, scripts/hermes-mcp-provision.sh, tests/spec/hermes-mcp-access.bats, docs/agent-guide/registry/expected/agy-mcp-config.json | |
| p3 | tasks.d/p3-toolset-curate.md | impl | docs/agent-guide/registry/capabilities.yaml, docs/agent-guide/registry/mcp.yaml, .claude/settings.json, .claude/skills/references/mcp-tool-guide.md, .opencode/skills/references/mcp-tool-guide.md, docs/agent-guide/maps/toolset-map.md, docs/agent-guide/20-werkzeuge.md, components/website/src/lib/agent-guide.generated.json | |
| p-tests | tasks.d/p-tests-guards.md | tests | tests/spec/software-factory/decommission-guard.bats, tests/spec/mcp-tooling.bats | p1,p2,p3 |

## Sequencing

- p1 und p2 sind voneinander unabhängig (disjunkte Dateien) und können in
  beliebiger Reihenfolge laufen; p-tests läuft nach allen drei.
- p3 erst nach Merge von PR #5966 (agent-routing-docs) ausführen: Beide
  bearbeiten `mcp-tool-guide.md`. Das Ticket bleibt bis dahin auf Hold.

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
