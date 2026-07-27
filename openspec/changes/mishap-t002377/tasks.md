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
.worktrees/llm-server-watchdog
Taskfile.yml
```

## Tasks

### Task 1: Fix llm-server-watchdog detached HEAD
- [ ] **Analysis.** Identify the current state of `.worktrees/llm-server-watchdog`. Check if the branch `fix/llm-server-watchdog-T002335` exists and matches the intended state.
- [ ] **Action.** Either attach the worktree to the branch if the changes are desired, or clean up and remove the worktree if it is abandoned WIP.
- [ ] **Verification.** Confirm the worktree is no longer in detached HEAD with dirty files.

### Task 2: Fix test:spec:changed false-positive exit 1
- [ ] **Investigation.** Analyze the `test:spec:changed` task in `Taskfile.yml` and its underlying shell script to find the cause of the false-positive exit code 1.
- [ ] **RED Test Step.** Reproduce the false-positive failure using the existing BATS test suite.
  ```bash
  expected: FAIL
  bats tests/spec/software-factory.bats --filter "factory-mcp registers openspec_find_similar tool"
  ```
- [ ] **Fix.** Correct the exit code logic in the script so it returns 0 when all sub-tests pass.
- [ ] **Verification.** Verify `task test:spec:changed` returns success.

## Verify (RED → GREEN)

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
