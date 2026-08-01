# Proposal: mishap-bundle-infra-testspec-ci

## Why
This proposal consolidates and resolves a bundle of 10 infrastructure, process, testing, and repo-hygiene mishaps identified during development sessions:

1. **Mishap 1 (worktree-create.sh aborts):** `worktree-create.sh` exits silently without creating a worktree when the main checkout is on a non-main branch. It leaves the user with a dirty/swapped status due to stash popping.
2. **Mishap 2 (commit-msg-Hook reporting):** The commit-msg hook output mixes with pre-push bypass messages, misleading users into thinking a commit was created when it was actually rejected.
3. **Mishap 3 (agent-lock claim worktree path resolution):** Relative paths (like `.`) passed to `--worktree` are not fully resolved/normalized, leading to trailing `/./` paths that trigger false positives in `worktree-write-guard.sh` and lock the user out.
4. **Mishap 4 (Test assertion check):** `spec-dir-convention.bats` verified implementation flags (`grep` on source) instead of actual results, masking a bug where 144/149 test files were not indexed.
5. **Mishap 5 (Bug ticket triaging hypothese):** Bug descriptions assert unchecked causes as fact. We need a triaging rule requiring verification of cause during planning/triaging, separating symptom and hypotheses.
6. **Mishap 6 (dev-flow-execute commit-vs-diff):** The commit-vs-diff check verifies the entire commit history range `BASE_SHA..HEAD_SHA`, capturing unrelated commits pulled in during rebases. It should only inspect commits unique to the feature branch.
7. **Mishap 7 (Subagent background tests):** Subagents violate the "no background runs for long test-runs" directive. We need a hard programmatic guard or wrapper script enforcing timeouts and preventing background runs.
8. **Mishap 8 (agent-lock reap liveness):** `agent-lock.sh reap` checks Claude Code's liveness using the Session ID (which changes per bash invocation) instead of the PID, failing to clean stale locks.
9. **Mishap 9 (Main checkout branch drift):** The main checkout was left on a feature branch, skewing `devflow-post-merge-deploy.sh` diff boundaries. The post-merge deploy script should diff against a robust base (like `origin/main~1..origin/main`).
10. **Mishap 10 (devflow-post-merge-deploy.sh target commit):** The script always looks at `origin/main -1` instead of grep-matching the specific merged ticket ID, leading to missing deploy triggers when intervening commits exist.

## What
We will implement fixes and rule updates for each of these 10 items:
1. **scripts/worktree-create.sh:** Fail-closed with a clear message BEFORE stashing if the main checkout is not on `main`.
2. **.githooks/commit-msg:** Output an explicit "No commit created" message on rejection, and clean up/suppress pre-push framing context during commit phase.
3. **scripts/agent-lock.sh:** Use `realpath` or `cd ... && pwd` in `cmd_claim` to resolve relative worktree paths cleanly.
4. **CLAUDE.md & tests/spec/mishap-bundle-infra-testspec-ci.bats:** Add test convention guidelines and write tests verifying the changes.
5. **skills/dev-flow-plan & ticket-ops:** Add a triage validation rule to verify bug causes before brainstorming.
6. **workflows/ci.yml / scripts/check-commit-vs-diff.sh:** Scope commit-vs-diff to only check branch-local commits.
7. **scripts/devflow-verify.sh:** Create a wrapper script that enforces timeouts and execution rules for verifications instead of relying purely on subagent prompt discipline.
8. **scripts/agent-lock.sh:** Update `_sid_alive` or liveness checks to prefer PID-based verification over SID.
9. **scripts/devflow-post-merge-deploy.sh:** Ensure diff baselines are robust against main checkout branch drift.
10. **scripts/devflow-post-merge-deploy.sh:** Select target commits by grep-matching the specific `[T00XXXX]` ticket ID.

_Ticket: T002448_
