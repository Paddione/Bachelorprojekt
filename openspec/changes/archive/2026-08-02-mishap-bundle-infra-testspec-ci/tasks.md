---
title: "mishap-bundle-infra-testspec-ci — Implementation Plan"
ticket_id: T002448
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-bundle-infra-testspec-ci — Implementation Plan

_Ticket: T002448_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `CLAUDE.md` | 219 | - |
| `.githooks/commit-msg` | 49 | - |
| `.github/workflows/ci.yml` | 626 | - |
| `scripts/agent-lock.sh` | 517 | 283 |
| `scripts/devflow-post-merge-deploy.sh` | 71 | 729 |
| `scripts/devflow-verify.sh` | 0 | 800 |
| `scripts/worktree-create.sh` | 327 | 473 |
| `tests/spec/mishap-bundle-infra-testspec-ci.bats` | 0 | 800 |


## Tasks

### Task 1: Write failing tests for infrastructure mishaps
- Add `tests/spec/mishap-bundle-infra-testspec-ci.bats` to reproduce the bugs.
- **Failing-Test-Step (RED):** The test must fail initially.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-infra-testspec-ci.bats
# expected: FAIL
```

### Task 2: Fix worktree-create.sh main checkout check (Mishap 1)
- Modify `scripts/worktree-create.sh` to check if the main checkout is on `main` before stashing.
- Fail closed with a clear message if not.

### Task 3: Fix commit-msg hook formatting (Mishap 2)
- Modify `.githooks/commit-msg` to cleanly notify rejection without pre-push bypass context when running commit.

### Task 4: Normalise worktree paths in agent-lock claim (Mishap 3)
- Modify `scripts/agent-lock.sh` to resolve relative path arguments for `--worktree` using `realpath` or `cd ... && pwd`.

### Task 5: Document test conventions in CLAUDE.md (Mishap 4)
- Add rules to `CLAUDE.md` to check outcomes/results of commands instead of grepping script implementation.

### Task 6: Document bug triage cause-verification in dev-flow-plan (Mishap 5)
- Update `dev-flow-plan` skills reference to include cause verification guidelines.

### Task 7: Scope commit-vs-diff to branch-local commits (Mishap 6)
- Modify `.github/workflows/ci.yml` or relevant scripts to scope the check to feature branch commits only.

### Task 8: Create devflow-verify.sh wrapper to prevent background runs (Mishap 7)
- Add `scripts/devflow-verify.sh` to wrap task commands, enforce timeouts, and reject running in background.

### Task 9: Fix agent-lock reap to check PID liveness (Mishap 8)
- Update `scripts/agent-lock.sh` to use `owner_pid` liveness check as primary.

### Task 10: Fix devflow-post-merge-deploy.sh baseline and commit selection (Mishap 9 & 10)
- Update `scripts/devflow-post-merge-deploy.sh` to select the commit by matching ticket ID and ensure robust diffing.

### Task 11: Final Verification
- Run the three mandatory CI gates to verify everything works:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```

