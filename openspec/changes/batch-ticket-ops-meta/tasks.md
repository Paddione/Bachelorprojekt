---
title: "batch-ticket-ops-meta — Implementation Plan"
ticket_id: T003541
domains: [plan-authoring, dev-tooling, factory]
status: active
file_locks: []
shared_changes: false
batch_id: T003541
parent_feature: null
depends_on_plans: []
---

# batch-ticket-ops-meta — Implementation Plan

_Ticket: T003541 — Batch: ticket-ops/ticket-mcp/agent-lock Meta-Fixes (7 Kinder)_

## File Structure

```
.claude/skills/references/ticket-ops-procedures.md                    (p1 — Triage-Query Chunking + Wellenbildung Freshness-Kante)
scripts/ticket-mcp/go/internal/tools/workflow.go                      (p2 — MCP stage_plan hold readiness)
scripts/ticket-mcp/go/internal/tools/workflow_test.go                 (p2 — Go-Unit-Test)
scripts/ticket-mcp/go/internal/tools/mishap.go                        (p3 — Mishap resolve/withdraw)
scripts/ticket-mcp/go/internal/tools/mishap_test.go                   (p3 — Go-Unit-Test)
scripts/agent-lock.sh                                                 (p4 — Heartbeat-Refresh; Ist 694 - Baseline 0 -> Budget 106)
scripts/agent-lock-identity.sh                                        (p4 — SID-Bindung an Session statt Serverprozess; Ist 88 - Baseline 0 -> Budget 712)
scripts/vda/ticket/_ticket-core.sh                                    (p4 — Lock-Guard SID-Drift; Ist 214 - Baseline 0 -> Budget 586)
scripts/hooks/worktree-write-guard.sh                                 (p4 — Heartbeat-Konsument; Ist 192 - Baseline 0 -> Budget 608)
.opencode/prompts/orchestrator.md                                     (p5 — Empty-Return-Rule Vorab-Check)
scripts/factory/opencode-exec.sh                                      (p5 — Empty-Return-Rule Vorab-Check; Ist 142 - Baseline 0 -> Budget 658)
tests/spec/batch-ticket-ops-meta.bats                                 (p6 — Sammel-BATS; NEU)
openspec/changes/batch-ticket-ops-meta/specs/ticket-ops.md            (p6 — Delta-Spec; NEU)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-procedures.md` | impl | `.claude/skills/references/ticket-ops-procedures.md` | |
| p2 | `tasks.d/p2-stage-hold.md` | impl | `scripts/ticket-mcp/go/internal/tools/workflow.go`, `scripts/ticket-mcp/go/internal/tools/workflow_test.go` | |
| p3 | `tasks.d/p3-mishap-withdraw.md` | impl | `scripts/ticket-mcp/go/internal/tools/mishap.go`, `scripts/ticket-mcp/go/internal/tools/mishap_test.go` | |
| p4 | `tasks.d/p4-agent-lock.md` | impl | `scripts/agent-lock.sh`, `scripts/agent-lock-identity.sh`, `scripts/vda/ticket/_ticket-core.sh`, `scripts/hooks/worktree-write-guard.sh` | |
| p5 | `tasks.d/p5-empty-return.md` | impl | `.opencode/prompts/orchestrator.md`, `scripts/factory/opencode-exec.sh` | |
| p6 | `tasks.d/p6-tests.md` | tests | `tests/spec/batch-ticket-ops-meta.bats`, `openspec/changes/batch-ticket-ops-meta/specs/ticket-ops.md` | p1, p2, p3, p4, p5 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test + die Go-Unit-Tests reproduzieren
      die Defekte (Query-Chunking, Freshness-Kante, hold-Readiness, Mishap-Withdraw,
      SID-Drift, Heartbeat-Refresh, Empty-Return-Vorab-Check). Sie MÜSSEN auf dem
      aktuellen Branch fehlschlagen bzw. den Defekt sichtbar machen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-ticket-ops-meta.bats
# expected: FAIL (red — die Fixes sind nicht implementiert)
(cd scripts/ticket-mcp/go && go test ./internal/tools/... )
# expected: FAIL für die neuen Defekt-Tests
```

- [ ] **Fix-Step (GREEN).** Implementiere die Fixes p1..p5. Die Tests aus dem
      vorherigen Schritt müssen nun grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T003174 → p1 (Triage-Query Token-Limit)
- T003176 → p1 (Wellenbildung Freshness-Kante, gebündelt)
- T002937 → p2 (stage_plan hold readiness Drift)
- T003134 → p3 (Mishap-Buffer Rücknahmepfad)
- T003229 → p4 (ticket-mcp SID-Drift)
- T003284 → p4 (agent-lock Heartbeat-TTL)
- T003546 → p5 (Empty-Return False-Positive)
