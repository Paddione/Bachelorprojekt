---
title: "worktree-remove-claim-guard — Implementation Plan"
ticket_id: T005115
domains: [scripts, skills, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-remove-claim-guard — Implementation Plan

_Ticket: T005115_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/worktree-clean-check.sh` | 73 | 727 |
| `scripts/factory/mishap-rollup.sh` | 279 | 521 |
| `.claude/skills/dev-flow-plan/SKILL.md` | groß | nur Schritt-−1-Block anpassen |
| `tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats` | neu | neu |
| `openspec/changes/worktree-remove-claim-guard/{proposal,tasks}.md` | neu | Plan-Artefakte |
| `openspec/changes/worktree-remove-claim-guard/specs/dev-flow-plan.md` | neu | Delta zum SSOT |
| `website/src/data/test-inventory.json` | generiert | via `task test:inventory` |

## Task 1: RED — failing Test für den Claim-Guard

- [ ] **Failing-Test-Step (RED).** `tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats`
      liegt im Branch und schlägt fehl: ein Worktree mit fremdem branch-Claim wird heute
      als sauber durchgewunken (rc 0 statt 1).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats
# expected: FAIL (red — Claim wird nicht geprüft)
```

## Task 2: GREEN — worktree-clean-check prüft Claims

- [ ] In `scripts/worktree-clean-check.sh` nach dem Dirty-Check: Branch des Worktrees
      ermitteln (`git -C "$path" rev-parse --abbrev-ref HEAD`), dann
      `agent-lock.sh check branch "$branch"` aufrufen; rc 3 (held) → Befund-Meldung
      mit dem Lock-Inhalt und Exit 1. rc 0 (free/mine) und rc 2 (nicht prüfbar) lassen
      den bisherigen Kontrakt unverändert. `AGENT_LOCK_DIR` wird vom agent-lock-Aufruf
      automatisch respektiert. `bash -n` aufs Skript.
- [ ] In `.claude/skills/dev-flow-plan/SKILL.md` Schritt −1 den Block „Stale Worktrees
      ggf. löschen" um die Pflicht erweitern: vor `git worktree remove` immer
      `scripts/worktree-clean-check.sh <path>`; schlägt sie an (rc 1), Worktree stehen
      lassen. Den bestehenden Satz „Stale Worktrees ggf. löschen: git worktree remove
      <path> --force && git branch -D <branch>" entsprechend ergänzen.
- [ ] In `scripts/factory/mishap-rollup.sh`: nach der Worktree-Anlage den Zyklus-Branch
      claimen (`agent-lock.sh claim branch "$BRANCH" --worktree "$WT" --label
      mishap-rollup`), im trap-Cleanup `release branch "$BRANCH"` (best-effort).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats
# expected: PASS (green)
```

## Task 3: Inventory und Final Verification

- [ ] `task test:inventory` ausführen und `website/src/data/test-inventory.json` committen.
- [ ] `bash scripts/openspec.sh validate worktree-remove-claim-guard` bleibt OK.
- [ ] Bestehende worktree-clean-check-Tests (falls vorhanden) grün halten; beide
      Formen (T002696) für dev-flow-plan laufen lassen.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
