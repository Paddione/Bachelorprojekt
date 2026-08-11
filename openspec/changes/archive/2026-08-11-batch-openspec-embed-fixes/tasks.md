---
title: "batch-openspec-embed-fixes — Implementation Plan"
ticket_id: T003491
domains: [plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: T003491
parent_feature: null
depends_on_plans: []
---

# batch-openspec-embed-fixes — Implementation Plan

_Ticket: T003491 — Batch: Openspec-Embed Fixes (7 Kinder)_

## File Structure

```
scripts/openspec-embed-local.sh      (p1)
scripts/openspec-embed-lib.sh        (p1)
scripts/openspec-embed.mjs           (p2)
.githooks/post-commit                (p3)
scripts/post-commit-embed.mjs        (p3)
scripts/openspec.sh                  (p4)
scripts/plan-lint.sh                 (p5)
docs/agent-guide/                    (p7)
tests/spec/batch-openspec-embed-fixes.bats  (p8)
openspec/changes/batch-openspec-embed-fixes/specs/batch-openspec-embed-fixes.md (p8)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-partial-chunking.md` | impl | `scripts/openspec-embed-local.sh`, `scripts/openspec-embed-lib.sh` | |
| p2 | `tasks.d/p2-port-conflict.md` | impl | `scripts/openspec-embed.mjs` | |
| p3 | `tasks.d/p3-false-unreachable.md` | impl | `.githooks/post-commit`, `scripts/post-commit-embed.mjs` | |
| p4 | `tasks.d/p4-archive-batch.md` | impl | `scripts/openspec.sh` | |
| p5 | `tasks.d/p5-todo-seed-gate.md` | impl | `scripts/plan-lint.sh` | p4 |
| p6 | `tasks.d/p6-completeness-backfill.md` | docs | `docs/agent-guide/README.md` | p1, p2 |
| p7 | `tasks.d/p7-archive-main-docs.md` | docs | `docs/agent-guide/openspec-workflow.md` | p4 |
| p8 | `tasks.d/p8-tests.md` | tests | `tests/spec/batch-openspec-embed-fixes.bats`, `openspec/changes/batch-openspec-embed-fixes/specs/batch-openspec-embed-fixes.md` | p1, p2, p3, p4, p5, p6, p7 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert die Defekte
      (Partial-Chunking, Port-Kollision, false-unreachable, Platzhalter-Seed).
      Er MUSS auf dem aktuellen Branch fehlschlagen. `expected: FAIL` im Step-Body.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-openspec-embed-fixes.bats
# expected: FAIL (red — die Fixes sind nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere die Fixes p1..p7. Der BATS-Test
      aus dem vorherigen Schritt muss nun grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T003268 → p1 (Partial-Chunking + set -e)
- T003384 → p2 (Port 15432)
- T003177 → p3 (false-unreachable Meldung)
- T003140 → p4 (archive Batch-Modus)
- T003281 → p5 (Platzhalter-Seed-Gate, fail-closed)
- T002877 → p6 (Completeness-Backfill-Doku)
- T003287 → p7 (Archiv-Commit-Doku)
