---
title: "mishap-t002377 — Implementation Plan"
ticket_id: T002377
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# mishap-t002377 — Implementation Plan

_Ticket: T002377_

## File Structure

```
scripts/find-changed-tests.sh   (geaendert) — RUN_ALL-Fallback meldet seinen Grund
Taskfile.yml                   (geaendert) — Vollauf von gezielter Auswahl unterscheiden
tests/spec/ci-cd.bats          (erweitert) — 2 Guards, RED gegen origin/main verifiziert
```

## Tasks

### Task 1: Fix llm-server-watchdog detached HEAD

> **Befund: trifft nicht zu.** Der Worktree haengt an `fix/llm-server-watchdog-T002335`
> (`git worktree list`), der Baum ist sauber. Kein Eingriff noetig — nur verifiziert.
- [x] **Analysis.** Identify the current state of `.worktrees/llm-server-watchdog`. Check if the branch `fix/llm-server-watchdog-T002335` exists and matches the intended state.
- [x] **Action.** Either attach the worktree to the branch if the changes are desired, or clean up and remove the worktree if it is abandoned WIP.
- [x] **Verification.** Confirm the worktree is no longer in detached HEAD with dirty files.

### Task 2: Fix test:spec:changed false-positive exit 1

> **Befund: andere Ursache als vermutet.** Der genannte RED-Test existiert nicht (`1..0`,
> Exit 0), und `task test:spec:changed` liefert auf main wie im Worktree Exit 0. Ein
> Exit-Code-Fehler war nicht reproduzierbar. Reproduzierbar ist der **stumme** RUN_ALL-
> Fallback: 138/138 Spec-Dateien, 2016 Tests, >10 min — laeuft das in ein Timeout, ist der
> Exit != 0 bei gruenen Untertests. Der Fallback meldet jetzt seinen Grund; am Exit-Code
> wird bewusst nichts geaendert (siehe proposal.md, Abgrenzung).
- [x] **Investigation.** Analyze the `test:spec:changed` task in `Taskfile.yml` and its underlying shell script to find the cause of the false-positive exit code 1.
- [x] **RED Test Step.** Reproduce the false-positive failure using the existing BATS test suite.
  ```bash
  expected: FAIL
  bats tests/spec/software-factory.bats --filter "factory-mcp registers openspec_find_similar tool"
  ```
- [x] **Fix.** Correct the exit code logic in the script so it returns 0 when all sub-tests pass.
- [x] **Verification.** Verify `task test:spec:changed` returns success.

## Verify (RED → GREEN)

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
