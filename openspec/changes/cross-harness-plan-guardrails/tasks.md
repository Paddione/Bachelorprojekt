---
title: "cross-harness-plan-guardrails — Implementation Plan"
ticket_id: T003267
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cross-harness-plan-guardrails — Implementation Plan

_Ticket: T003267_

Index eines Multi-Partial-Plans (Mechanik T002074): sechs disjunkte Partials unter
`tasks.d/`, das letzte trägt die Tests-Rolle mit dem Failing-Test-Step. Kontext und
Entscheidungen: `proposal.md` + `design.md` im selben Ordner.

## File Structure

```
scripts/plan-preflight.sh                                  (neu — p1)
scripts/vda/ticket/stage-plan.sh                           (geändert — p2)
scripts/factory/mishap-rollup.sh                           (geändert — p2)
scripts/factory/auto-chore-plan.sh                         (geändert — p2)
scripts/batch-workflow-gen.sh                              (geändert — p2)
scripts/ticket-mcp/go/internal/tools/workflow.go           (geändert — p2)
scripts/plan-lint.sh                                       (geändert — p3)
scripts/factory/pipeline.mjs                               (geändert — p3)
docs/agent-guide/registry/plan-guards.yaml                 (neu — p4)
.opencode/skills/opencode-flow-plan/SKILL.md               (geändert — p5)
.claude/skills/dev-flow-plan/SKILL.md                      (geändert — p5)
.claude/skills/references/dev-flow-plan-phases.md          (geändert — p5)
.claude/skills/references/ticket-stage-procedure.md        (geändert — p5)
openspec/changes/cross-harness-plan-guardrails/specs/dev-flow-plan.md  (Delta — p5)
tests/spec/dev-flow-plan/plan-preflight.bats               (neu — p6)
tests/spec/dev-flow-plan/stage-plan-contract.bats          (neu — p6)
tests/spec/dev-flow-plan/plan-lint-rules.bats              (neu — p6)
tests/spec/dev-flow-plan/guard-parity.bats                 (neu — p6)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-preflight.md` | impl | `scripts/plan-preflight.sh` | |
| p2 | `tasks.d/p2-stage-contract.md` | impl | `scripts/vda/ticket/stage-plan.sh`, `scripts/factory/mishap-rollup.sh`, `scripts/factory/auto-chore-plan.sh`, `scripts/batch-workflow-gen.sh`, `scripts/ticket-mcp/go/internal/tools/workflow.go` | |
| p3 | `tasks.d/p3-lint-rules.md` | impl | `scripts/plan-lint.sh`, `scripts/factory/pipeline.mjs` | |
| p4 | `tasks.d/p4-guard-registry.md` | impl | `docs/agent-guide/registry/plan-guards.yaml` | |
| p5 | `tasks.d/p5-prose-sync.md` | impl | `.opencode/skills/opencode-flow-plan/SKILL.md`, `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/references/dev-flow-plan-phases.md`, `.claude/skills/references/ticket-stage-procedure.md`, `openspec/changes/cross-harness-plan-guardrails/specs/dev-flow-plan.md` | p1, p2, p3, p4 |
| p6 | `tasks.d/p6-tests.md` | tests | `tests/spec/dev-flow-plan/plan-preflight.bats`, `tests/spec/dev-flow-plan/stage-plan-contract.bats`, `tests/spec/dev-flow-plan/plan-lint-rules.bats`, `tests/spec/dev-flow-plan/guard-parity.bats` | p1, p2, p3, p4, p5 |

Hinweis zur Reihenfolge: Die Tests aus p6 werden gemäß Rot-Grün-Prinzip ZUERST
geschrieben (siehe P6.5 — sie sind vor p1–p5 rot); das Manifest-`depends_on` von p6
beschreibt die Grün-Abnahme, nicht den Schreibzeitpunkt.

## Final Verification

- [ ] Gesamtabnahme des Change — alle Kommandos müssen grün sein:

```bash
bash scripts/plan-lint.sh openspec/changes/cross-harness-plan-guardrails/tasks.md
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan/
tests/unit/lib/bats-core/bin/bats -r tests/spec/harness-workflow-split*
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Deliverable-Probe (S4/Orphan): `grep -rl 'plan-preflight.sh' .claude/ .opencode/ tests/`
      liefert Treffer in Skill-Prosa UND Tests; `bash scripts/plan-lint.sh --rules | head -3`
      zeigt die Regel-Prosa.
- [ ] Regeneriertes `website/src/data/test-inventory.json` ist mitcommittet (CI-Inventar-Check).
