---
title: "fix-factory-lock-worktree-safety — Implementation Plan"
ticket_id: T003677
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-factory-lock-worktree-safety — Implementation Plan

_Ticket: T003677 — Root-Cause: Factory-Merge revertiert fremden Fix ohne Lock_

## File Structure

```
scripts/factory/pipeline.js                 # agent-lock claim vor Worktree-Schreibzugriff
scripts/agent-lock.sh                       # ggf. claim-validation erweitern
tests/spec/software-factory/                # Guard: Factory beansprucht Lock vor Schreibzugriff
```

## Tasks

### P1: agent-lock-Claim in pipeline.js einfuegen

**Datei:** `scripts/factory/pipeline.js`

Vor jedem Schreibzugriff auf einen Worktree (Merge, Commit, Rebase) MUSS die Factory einen
`agent-lock.sh claim branch <branch>` setzen. Der Lock wird nach Abschluss freigegeben.

Zwei belegte Faelle ohne Lock:
1. T003664: Factory-Merge revertierte T003003-Fix in `opencode-flow-execute/SKILL.md`
2. T003802: Dieselbe Regression lag in zwei Worktrees gleichzeitig

**Aktion:** In der Merge/Commit-Sektion von `pipeline.js` vor dem `git`-Aufruf:
```bash
bash scripts/agent-lock.sh claim branch "$BRANCH" --worktree "$WORKTREE"
# ... git operation ...
bash scripts/agent-lock.sh release branch "$BRANCH"
```

### P2: Lock-Pre-Check vor Worktree-Betreten

**Datei:** `scripts/factory/pipeline.js`

Vor dem Betreten eines existierenden Worktrees prueft die Factory, ob der Branch bereits von
einer anderen Session gelockt ist. Bei aktivem Fremd-Lock: ueberspringen, nicht ueberschreiben.

### P3: Guard-Test

**Datei:** `tests/spec/software-factory/factory-claims-lock-before-write.bats`

Test: Simuliert Factory-Schreibzugriff und prueft, dass ein agent-lock-Claim VOR dem Schreiben
gesetzt wurde. Positiv-Anker: Lock-Datei existiert vor dem git-Commit.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Factory-Schreibzugriff ohne vorherigen Lock.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-claims-lock-before-write.bats
# expected: FAIL (rot — Factory schreibt ohne Lock)
```

- [x] **Fix-Step (GREEN).** Lock wird vor Schreibzugriff gesetzt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-claims-lock-before-write.bats
# expected: PASS (gruen — Lock existiert vor jedem Schreibzugriff)
```

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
