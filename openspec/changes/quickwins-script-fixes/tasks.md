---
title: "quickwins-script-fixes — Implementation Plan"
ticket_id: T003276
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: T003276
parent_feature: null
depends_on_plans: []
---

# quickwins-script-fixes — Implementation Plan

_Ticket: Quick-Win-Batch — T002765, T002726, T002727 (3 Tickets, ein Branch)_

## File Structure

```
scripts/plan-touched-files.sh           (p1)
scripts/preflight-pr-scope.sh           (p2)
tests/spec/ci-cd/preflight-pr-scope.bats (p2)
scripts/sdlc/backup-tickets.sh          (p3)
tests/spec/sdlc-isolation/e3-backup.bats (p3)
tests/spec/quickwins-script-fixes.bats  (p4)
openspec/changes/quickwins-script-fixes/specs/quickwins-script-fixes.md (p4)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-touched-files.md` | impl | `scripts/plan-touched-files.sh` | |
| p2 | `tasks.d/p2-preflight-scope.md` | impl | `scripts/preflight-pr-scope.sh`, `tests/spec/ci-cd/preflight-pr-scope.bats` | |
| p3 | `tasks.d/p3-backup-restore.md` | impl | `scripts/sdlc/backup-tickets.sh`, `tests/spec/sdlc-isolation/e3-backup.bats` | |
| p4 | `tasks.d/p4-tests.md` | tests | `tests/spec/quickwins-script-fixes.bats`, `openspec/changes/quickwins-script-fixes/specs/quickwins-script-fixes.md` | p1, p2, p3 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert die drei Defekte
      (touched-files, preflight-scope, backup-restore). Er MUSS auf dem aktuellen
      Branch fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/quickwins-script-fixes.bats
# expected: FAIL (red — die Fixes sind nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere die Fixes p1..p3. Der BATS-Test
      aus dem vorherigen Schritt muss nun grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T002765 → p1 (plan-touched-files)
- T002726 → p2 (preflight-pr-scope.bats)
- T002727 → p3 (backup-tickets restore-check)
