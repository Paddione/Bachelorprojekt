---
title: "batch-ticket-ops-meta-fixes — Implementation Plan"
ticket_id: T003541
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: T003541
parent_feature: null
depends_on_plans: []
---

# batch-ticket-ops-meta-fixes — Implementation Plan

_Ticket: T003541 — Batch: ticket-ops/ticket-mcp Meta-Fixes (4 Kinder)_

## File Structure

```
.claude/skills/references/ticket-ops-procedures.md  (p1 — Triage-Query Chunking)
.claude/skills/references/ticket-ops-procedures.md  (p2 — Wellenbildung Freshness-Kante)
scripts/vda/ticket/stage-plan.sh                    (p3 — hold readiness)
scripts/ticket-mcp/go/internal/tools/stage_plan.go  (p3 — MCP/CLI-Drift)
scripts/ticket-mcp/go/internal/tools/mishap.go      (p4 — resolve/withdraw)
scripts/ticket-mcp/go/internal/tools/mishap_test.go (p4 — Tests)
tests/spec/batch-ticket-ops-meta-fixes.bats         (p5)
openspec/changes/batch-ticket-ops-meta-fixes/specs/*.md (p5)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-procedures-fixes.md` | impl | `.claude/skills/references/ticket-ops-procedures.md` | |
| p3 | `tasks.d/p3-stage-hold-drift.md` | impl | `scripts/vda/ticket/stage-plan.sh`, `scripts/ticket-mcp/go/internal/tools/stage_plan.go` | |
| p4 | `tasks.d/p4-mishap-withdraw.md` | impl | `scripts/ticket-mcp/go/internal/tools/mishap.go`, `scripts/ticket-mcp/go/internal/tools/mishap_test.go` | |
| p5 | `tasks.d/p5-tests.md` | tests | `tests/spec/batch-ticket-ops-meta-fixes.bats`, `openspec/changes/batch-ticket-ops-meta-fixes/specs/batch-ticket-ops-meta-fixes.md` | p1, p3, p4 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert die Defekte
      (Query-Chunking, Freshness-Kante, hold-Drift, Mishap-Withdraw).
      Er MUSS auf dem aktuellen Branch fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-ticket-ops-meta-fixes.bats
# expected: FAIL (red — die Fixes sind nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere die Fixes p1..p4. Der BATS-Test
      aus dem vorherigen Schritt muss nun grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T003174 → p1 (Triage-Query Token-Limit)
- T003176 → p1 (Wellenbildung Freshness-Kante, gebündelt)
- T002937 → p3 (stage_plan hold readiness Drift)
- T003134 → p4 (Mishap-Buffer Rücknahmepfad)
