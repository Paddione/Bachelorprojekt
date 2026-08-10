---
title: "batch-repo-hygiene-ops-fixes — Implementation Plan"
ticket_id: T003490
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: T003490
parent_feature: null
depends_on_plans: []
---

# batch-repo-hygiene-ops-fixes — Implementation Plan

_Ticket: T003490 — Batch: repo-hygiene-ops §1-§3 Fixes (6 Kinder)_

## File Structure

```
scripts/branch-reaper.sh                        (p1)
.claude/skills/references/repo-hygiene-ops.md   (p2 — alle §1-§3 Textänderungen)
scripts/devflow-ci-watch.sh                     (p3)
scripts/repo-hygiene-cron.sh                    (p4)
tests/spec/batch-repo-hygiene-ops-fixes.bats    (p5)
openspec/changes/batch-repo-hygiene-ops-fixes/specs/batch-repo-hygiene-ops-fixes.md (p5)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-reaper-sweep.md` | impl | `scripts/branch-reaper.sh` | |
| p2 | `tasks.d/p2-runbook-fixes.md` | impl | `.claude/skills/references/repo-hygiene-ops.md` | p1 |
| p3 | `tasks.d/p3-ci-watch.md` | impl | `scripts/devflow-ci-watch.sh` | p2 |
| p4 | `tasks.d/p4-cron-vorcheck.md` | impl | `scripts/repo-hygiene-cron.sh` | p2 |
| p5 | `tasks.d/p5-tests.md` | tests | `tests/spec/batch-repo-hygiene-ops-fixes.bats`, `openspec/changes/batch-repo-hygiene-ops-fixes/specs/batch-repo-hygiene-ops-fixes.md` | p1, p2, p3, p4 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert die Defekte
      (Reaper-Sweep, gone-Prune, merge-tree, cancelled≠fail, headSha-Mix,
      tick-Vorcheck). Er MUSS auf dem aktuellen Branch fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes.bats
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

- T003074 → p1 (Reaper --sweep Modus)
- T003183 → p2 (§2 [gone]-Prune-Reihenfolge + Archiv-Tag)
- T003181 → p2 (§3 merge-tree Konfliktprobe)
- T003224 → p2+p3 (gh pr checks cancelled≠fail)
- T003225 → p3 (statusCheckRollup headSha-Filter)
- T003227 → p2+p4 (Factory-Tick-Vorcheck)
