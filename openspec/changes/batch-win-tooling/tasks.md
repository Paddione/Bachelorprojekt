# Tasks: Batch — T900054-Fallout Windows-Tooling

## Parent
- Ticket: T900073
- Children: T900067 (M10-Check), T900068 (BATS-Umlaut), T900066 (Worktree-Guard)
- Branch: `feature/batch-win-tooling-T900073`

## Structure
Disjunct partials — can be fan-out parallel:

| # | Partial | Child ticket | Files |
|---|---------|-------------|-------|
| p1 | M10-Deliverable-Check fix | T900067 | `docs/CLAUDE.md`, `scripts/agent-guide/` check |
| p2 | BATS-Umlaut-Guard | T900068 | `tests/unit/lib/bats-core/bin/bats`, `tests/CLAUDE.md` |
| p3 | Worktree-Write-Guard fail-closed | T900066 | `scripts/hooks/worktree-write-guard.sh`, `scripts/lib/worktree-prune-safe.sh` |

## Partial Manifest

### p1-m10-deliverable-fix
**Source:** tasks.d/p1-m10-deliverable-fix.md  
**Target spec:** scripts.md, ci-cd.md  
**Scope:** M10 Deliverable-Check in CLAUDE.md  
**Disjunkt:** Ja — nur docs/CLAUDE.md und Script-Pfad

### p2-bats-umlaut-guard
**Source:** tasks.d/p2-bats-umlaut-guard.md  
**Target spec:** spec-bats-agentic-ai.md, e2e-testing.md  
**Scope:** BATS runner encoding guard + CLAUDE.md naming rule  
**Disjunkt:** Ja — nur bats-core/bin/bats und tests/CLAUDE.md

### p3-worktree-write-guard
**Source:** tasks.d/p3-worktree-write-guard.md  
**Target spec:** scripts.md, agent-skills.md  
**Scope:** worktree-write-guard.sh fail-closed + lock-prune safe  
**Disjunkt:** Ja — nur hooks/ und lib/worktree-prune-safe.sh

## Verification (gesamter Batch)
1. Alle BATS-Tests durchlaufen: `tests/unit/lib/bats-core/bin/bats tests/spec/`
2. Deliverable-Check manuell validiert unter Windows/WSL
3. Worktree write guard mit geloeschtem worktree getestet (soll laut scheitern)
