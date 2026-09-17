---
title: "Batch T900054-Fallout Windows-Tooling"
ticket_id: T900073
domains: [scripts, tests, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Batch — T900054-Fallout Windows-Tooling

## File Structure

```
docs/CLAUDE.md                                           (aend) p1 — M10-Deliverable-Check
tests/CLAUDE.md                                          (aend) p2 — BATS Naming-Rules
tests/unit/lib/bats-core/bin/bats                       (aend) p2 — Umlaut-Guard
tests/spec/worktree-cross-platform.bats                 (aend) p3 — Lock-Guard-Tests
tests/spec/runner/bats-runner-guard.bats                (neu)  p2 — Umlaut-Guard-Test
tests/spec/worktree-write-guard.bats                    (neu)  p3 — Fail-Closed-Test
scripts/hooks/worktree-write-guard.sh                    (aend) p3 — Fail-Closed-Guard
scripts/lib/worktree-prune-safe.sh                       (aend) p3 — Lock-Prune-Safe
```

## Partial Manifest

### p1 — M10-Deliverable-Check falsch-negativ beheben
**Source:** tasks.d/p1-m10-deliverable-fix.md  
**Child:** T900067  
**Files:** `docs/CLAUDE.md`  
**Disjunkt:** Ja

### p2 — BATS-Runner Umlaut-Encoding-Guard
**Source:** tasks.d/p2-bats-umlaut-guard.md  
**Child:** T900068  
**Files:** `tests/unit/lib/bats-core/bin/bats`, `tests/CLAUDE.md`  
**Disjunkt:** Ja

### p3 — Worktree-Write-Guard fail-closed
**Source:** tasks.d/p3-worktree-write-guard.md  
**Child:** T900066  
**Files:** `scripts/hooks/worktree-write-guard.sh`, `scripts/lib/worktree-prune-safe.sh`  
**Disjunkt:** Ja

## Verification (gesamter Batch)
1. Alle BATS-Tests durchlaufen: `tests/unit/lib/bats-core/bin/bats tests/spec/`
2. Deliverable-Check manuell validiert unter Windows/WSL
3. Worktree write guard mit geloeschtem worktree getestet (soll laut scheitern)
