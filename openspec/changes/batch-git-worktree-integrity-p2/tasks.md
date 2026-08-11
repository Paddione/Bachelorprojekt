---
title: "batch-git-worktree-integrity-p2 — Implementation Plan"
ticket_id: T003795
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-git-worktree-integrity-p2 — Implementation Plan

_Ticket: T003795 — Batch: Git/Worktree-Integritaet P2-P4_

## File Structure

```
scripts/git-stash-net.sh              # P2
scripts/agent-lock.sh                 # P3
scripts/hooks/worktree-write-guard.sh # P3
tests/spec/                           # Guards
```

## Child Tickets

| Ticket | Phase | Titel |
|--------|-------|-------|
| T003069 | P2 | git stash pop nach Rebase |
| T003070 | P2 | Stash-Stack worktree-uebergreifend |
| T003105 | P2 | Rebase verliert Freshness-Artefakte |
| T003131 | P3 | worktree-write-guard SID-Besitzmodell |

## Tasks

### P1: P2 — Stash-Isolation + Rebase-Schutz

**Dateien:** `scripts/git-stash-net.sh`, `scripts/hooks/post-rewrite`

### P2: P3 — Worktree-Write-Guard SID-Modell

**Dateien:** `scripts/hooks/worktree-write-guard.sh`, `scripts/agent-lock.sh`

### P3: Guard-Tests

**Datei:** `tests/spec/`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/
# expected: FAIL (rot — P2-P4 noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).**

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
