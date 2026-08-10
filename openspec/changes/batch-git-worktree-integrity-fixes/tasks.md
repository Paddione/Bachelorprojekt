---
title: "batch-git-worktree-integrity-fixes — Implementation Plan"
ticket_id: T003539
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: T003539
parent_feature: null
depends_on_plans: []
---

# batch-git-worktree-integrity-fixes — Implementation Plan

_Ticket: T003539 — Batch: Git/Worktree-Integrität (7 Kinder)_

## File Structure

```
scripts/worktree-git-op-guard.sh        (p1 — stash pop Schutz)
scripts/worktree-clean-check.sh         (p2 — worktree-Schleife)
scripts/hooks/worktree-write-guard.sh   (p3 — SID-Besitzmodell)
scripts/git-stash-net.sh                (p4 — worktree-lokale Stashes)
scripts/worktree-create.sh              (p5 — Loose-Objects + Rebase-Schutz)
scripts/git-worktree-health.mjs         (p6 — Falsch-Positiv-Vorcheck)
.claude/skills/git-workflow/SKILL.md    (p7 — Runbook-Doku)
tests/spec/batch-git-worktree-integrity-fixes.bats (p8)
openspec/changes/batch-git-worktree-integrity-fixes/specs/*.md (p8)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-stash-pop-guard.md` | impl | `scripts/worktree-git-op-guard.sh` | |
| p2 | `tasks.d/p2-worktree-loop.md` | impl | `scripts/worktree-clean-check.sh` | |
| p3 | `tasks.d/p3-write-guard-sid.md` | impl | `scripts/hooks/worktree-write-guard.sh` | |
| p4 | `tasks.d/p4-stash-net.md` | impl | `scripts/git-stash-net.sh` | |
| p5 | `tasks.d/p5-loose-objects.md` | impl | `scripts/worktree-create.sh` | p1 |
| p6 | `tasks.d/p6-crash-dirty.md` | impl | `scripts/git-worktree-health.mjs` | p5 |
| p7 | `tasks.d/p7-rebase-freshness.md` | impl | `.claude/skills/git-workflow/SKILL.md` | p5, p4 |
| p8 | `tasks.d/p8-tests.md` | tests | `tests/spec/batch-git-worktree-integrity-fixes.bats`, `openspec/changes/batch-git-worktree-integrity-fixes/specs/batch-git-worktree-integrity-fixes.md` | p1, p2, p3, p4, p5, p6, p7 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert die Defekte
      (stash-pop, worktree-Schleife, SID-Besitz, Stash-Netz, Loose-Objects,
      Crash-Dirty, Rebase-Freshness). Er MUSS auf dem aktuellen Branch fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-git-worktree-integrity-fixes.bats
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

- T003069 → p1 (stash pop nach Rebase)
- T002998 → p2 (Worktree-Schleife misst Hauptrepo)
- T003131 → p3 (worktree-write-guard SID)
- T003070 → p4 (Stash-Stack worktree-übergreifend)
- T002994 → p5 (Loose-Objects blockieren fetch)
- T002995 → p6 (git status Falsch-Positiv nach Crash)
- T003105 → p7 (Rebase verliert Freshness-Artefakte)
