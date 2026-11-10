---
title: Plan: Registry-SSOT-Gates (5 Kandidaten)
ticket_id: null
domains: [website, infra, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: Registry-SSOT-Gates (5 Kandidaten)

Zweck (German): Alle 5 SSOT-Lücken aus der Graph-Analyse
(`~/dotfiles/.agents/goals/ssot-graph-luecken-inventur/PROGRESS.md`) mit dem
bewährten Muster schließen: 1 YAML-SSOT + fail-closed Check + generierte Map
+ Task. Unsicherheiten je Kandidat stehen in der Analyse (Gegenbeleg-Regel:
bestehender fail-closed Check mit `Pfad:Zeile` streicht den Kandidaten).

## Partial-Manifest

| Partial | Dateien (disjunkt) | Kandidat |
|---|---|---|
| p1-secrets | `docs/agent-guide/registry/secrets.yaml`, `scripts/secrets-check.mjs`, `docs/agent-guide/maps/secrets-map.md` | Secrets-Seal-Kette |
| p2-agents | `scripts/agents-check.mjs`, `docs/agent-guide/maps/agents-map.md` | Agent-Rollen/Modelle |
| p3-skills | `scripts/skills-check.mjs`, `docs/agent-guide/maps/skills-map.md` | Skill-Inventar |
| p4-content | `scripts/content-check.mjs`, `docs/agent-guide/maps/content-map.md` | Content-Registry |
| p5-api | `docs/agent-guide/registry/api.yaml`, `scripts/api-check.mjs`, `docs/agent-guide/maps/api-map.md` | API-Inventar |
| p6-wiring-verify | Taskfile-Einträge, Gates | alle |

## File Structure

- `.agents/plans/registry-ssot-gates/tasks.md` (dieser Index)
- `.agents/plans/registry-ssot-gates/tasks.d/p1-secrets.md` … `p6-wiring-verify.md`
- Registry: `docs/agent-guide/registry/` · Maps: `docs/agent-guide/maps/` ·
  Checks: `scripts/*-check.mjs`

## Globale Gates (P6)

- `task test:changed` grün; `task freshness:check` grün (Maps sind
  `generated_artifacts: true`); betroffene `*-check.mjs` je Kandidat grün.
- Kein PR-Auto-Merge hier — Plan-Stopp nach Commit+Push (dev-flow-execute folgt).
