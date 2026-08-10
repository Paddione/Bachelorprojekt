---
title: "batch-ci-check-eval-fixes — Implementation Plan"
ticket_id: T003540
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: T003540
parent_feature: null
depends_on_plans: []
---

# batch-ci-check-eval-fixes — Implementation Plan

_Ticket: T003540 — Batch: CI/Check-Auswertung (6 Kinder)_

## File Structure

```
scripts/devflow-ci-watch.sh              (p1 — vakuoses all())
scripts/git-workflow/SKILL.md            (p2 — Commit/Push-Auswertung)
scripts/pre-push-hook.sh                 (p3 — stale scope commits)
scripts/freshness-regenerate.sh          (p4 — openspec-status nach archive)
scripts/test-changed.sh                  (p5 — Live-E2E-Gate)
scripts/ci-cluster-bats.mjs              (p6 — Cluster-bats Ausführung)
tests/spec/batch-ci-check-eval-fixes.bats (p7)
openspec/changes/batch-ci-check-eval-fixes/specs/*.md (p7)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-vacuous-all.md` | impl | `scripts/devflow-ci-watch.sh` | |
| p2 | `tasks.d/p2-push-failure.md` | impl | `scripts/git-workflow/SKILL.md` | |
| p3 | `tasks.d/p3-stale-scope.md` | impl | `scripts/pre-push-hook.sh` | p2 |
| p4 | `tasks.d/p4-freshness-archive.md` | impl | `scripts/freshness-regenerate.sh` | |
| p5 | `tasks.d/p5-live-e2e-gate.md` | impl | `scripts/test-changed.sh` | |
| p6 | `tasks.d/p6-cluster-bats.md` | impl | `scripts/ci-cluster-bats.mjs` | |
| p7 | `tasks.d/p7-tests.md` | tests | `tests/spec/batch-ci-check-eval-fixes.bats`, `openspec/changes/batch-ci-check-eval-fixes/specs/batch-ci-check-eval-fixes.md` | p1, p2, p3, p4, p5, p6 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert die Defekte
      (vakuoses all, Push-Failure, stale scope, Freshness-Gap, Live-E2E,
      Cluster-bats). Er MUSS auf dem aktuellen Branch fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-ci-check-eval-fixes.bats
# expected: FAIL (red — die Fixes sind nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere die Fixes p1..p6. Der BATS-Test
      aus dem vorherigen Schritt muss nun grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T003109 → p1 (vakuoses all() auf leerer Checkliste)
- T002815 → p2 (abgelehnter Commit sieht aus wie Erfolg)
- T002827 → p3 (pre-push rejects valid push, stale scope)
- T003136 → p4 (Archive PR failed freshness gate)
- T003138 → p5 (test:changed startet Live-E2E)
- T002922 → p6 (Cluster-bats nie ausgeführt)
