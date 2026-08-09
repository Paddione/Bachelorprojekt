## ADDED Requirements

### Requirement: A public branch-liveness check is available to reap paths

`scripts/agent-lock.sh` SHALL expose a public subcommand `check-branch-live <branch>` that
wraps the existing internal `_branch_is_live_claimed()` helper. It SHALL exit 0 (and print
`live`) when `<branch>` carries a non-reapable agent-lock claim, and exit 1 (and print `free`)
otherwise. External worktree-removal callers use this single primitive instead of
reimplementing lock-liveness logic.

#### Scenario: A branch with a live foreign claim is reported live

- **GIVEN** an agent-lock claim of scope `branch` for `fix/demo-T000123` with a live
  `owner_pid`
- **WHEN** `agent-lock.sh check-branch-live fix/demo-T000123` runs
- **THEN** it prints `live` and exits 0

#### Scenario: A branch with no claim is reported free

- **GIVEN** no agent-lock claim exists for `fix/demo-T000456`
- **WHEN** `agent-lock.sh check-branch-live fix/demo-T000456` runs
- **THEN** it prints `free` and exits 1

### Requirement: worktree-create.sh's idempotency-remove respects a live foreign claim

`scripts/worktree-create.sh` SHALL NOT force-remove a pre-existing worktree at its target path
when the branch checked out there carries a live agent-lock claim owned by a different session.
Instead it SHALL abort with a diagnostic message identifying the branch and the claim, and a
distinct non-zero exit code, leaving the existing worktree and branch untouched.

A worktree whose checked-out branch carries no live claim, or a live claim owned by the calling
session itself, remains removable exactly as before (idempotent retry of the caller's own
aborted run).

#### Scenario: A colliding path with a foreign live claim is not removed

- **GIVEN** a worktree at `.worktrees/demo-T000123` on branch `fix/demo-T000123`, with a live
  agent-lock branch claim for `fix/demo-T000123` owned by a different session
- **WHEN** `scripts/worktree-create.sh feature/demo-T000123 .worktrees/demo-T000123` runs
- **THEN** it exits non-zero, prints a message naming the live claim, and the worktree at
  `.worktrees/demo-T000123` still exists on branch `fix/demo-T000123`

#### Scenario: A colliding path without a live claim is still removed (positive anchor)

- **GIVEN** a worktree at `.worktrees/demo-T000789` on branch `fix/demo-T000789`, with no
  agent-lock claim for `fix/demo-T000789`
- **WHEN** `scripts/worktree-create.sh feature/demo-T000789-v2 .worktrees/demo-T000789` runs
- **THEN** it removes the stale worktree and proceeds to create the new one (unchanged
  idempotent-retry behavior)

### Requirement: factory cleanup.sh skips branches and worktrees under a live foreign claim

`scripts/factory/cleanup.sh` SHALL check `agent-lock.sh check-branch-live <branch>` for its
`--branch` argument before removing the worktree or deleting the branch. When the branch
carries a live claim owned by a different session, it SHALL skip both removal steps and log
the skip visibly (exit 0 regardless — cleanup remains best-effort and non-fatal per its
existing contract).

#### Scenario: cleanup.sh skips a worktree with a live foreign claim

- **GIVEN** a worktree at `.worktrees/demo-T000321` on branch `fix/demo-T000321`, with a live
  agent-lock branch claim for `fix/demo-T000321` owned by a different session
- **WHEN** `scripts/factory/cleanup.sh --branch fix/demo-T000321 --worktree
  .worktrees/demo-T000321` runs
- **THEN** it logs a skip message, exits 0, and the worktree and branch still exist

#### Scenario: cleanup.sh still removes a worktree without a live claim (positive anchor)

- **GIVEN** a worktree at `.worktrees/demo-T000654` on branch `fix/demo-T000654`, with no
  agent-lock claim for `fix/demo-T000654`
- **WHEN** `scripts/factory/cleanup.sh --branch fix/demo-T000654 --worktree
  .worktrees/demo-T000654` runs
- **THEN** it removes the worktree and deletes the branch (unchanged behavior)
