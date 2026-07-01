## ADDED Requirements

### Requirement: Factory scripts never checkout/switch branches in the shared main checkout

The system SHALL statically guard (CI-gated test) that no script under `scripts/factory/`
issues a `git checkout` or `git switch` against the shared main checkout. Worktree-scoped
git operations (e.g. `git -C "$WORK_WT" ...`, or commands executed after `cd` into a
dedicated worktree created via `scripts/worktree-create.sh`) remain permitted.

#### Scenario: Factory script adds a raw checkout in the main checkout

- **GIVEN** a developer adds a new line to a script under `scripts/factory/` containing
  `git checkout <branch>` or `git switch <branch>` that is not scoped to `$WORK_WT`
- **WHEN** `task test:changed` (or CI) runs the factory-branch-switch-guard BATS test
- **THEN** the test fails, blocking merge until the checkout is removed or properly
  worktree-scoped

#### Scenario: Factory pipeline creates and works inside an isolated worktree

- **GIVEN** `scripts/factory/pipeline.js` creates a dedicated worktree via
  `scripts/worktree-create.sh` for a ticket
- **WHEN** the guard test scans `scripts/factory/`
- **THEN** the worktree-scoped commands are recognized as exempt and the test passes

### Requirement: main-checkout post-checkout guard reverts foreign branch switches to the claimed branch

The `main-checkout` agent-lock's `post-checkout` guard SHALL attempt a best-effort revert
to the branch recorded in a live foreign `main-checkout` lock's `branch` field when a
branch switch happens in the shared main checkout, unless a rebase, merge, or
cherry-pick is in progress, or `AGENT_LOCK_POSTCHECKOUT_REVERT=0` is set. The guard SHALL
never fail the underlying git command (fail-open) and SHALL never target a raw commit SHA.

#### Scenario: Foreign session switches branch while lock holder's branch is known

- **GIVEN** session A holds a live `main-checkout` lock with `branch=feature/x`
- **WHEN** session B (a different live SID) runs `git checkout main` in the shared main
  checkout
- **THEN** the `post-checkout` hook calls `agent-lock.sh guard-postcheckout`, which checks
  out `feature/x` again and logs a warning, without exiting non-zero

#### Scenario: Rebase in progress is exempt from the revert

- **GIVEN** session A holds a live `main-checkout` lock with `branch=feature/x`
- **WHEN** session B runs `git pull --rebase origin main` in the shared main checkout,
  triggering intermediate `post-checkout` events while `.git/rebase-merge` exists
- **THEN** `guard-postcheckout` returns immediately without warning or reverting, so
  session B's rebase completes undisturbed

#### Scenario: Lock has no recorded branch

- **GIVEN** a live foreign `main-checkout` lock exists with an empty `branch` field
- **WHEN** a branch switch happens in the shared main checkout
- **THEN** `guard-postcheckout` logs the existing warning only and does not attempt any
  checkout (no revert onto an unreliable target)

### Requirement: main-checkout lock is self-claimed on every commit

`scripts/agent-lock.sh::cmd_guard_precommit` SHALL, after confirming no live foreign
`main-checkout` lock blocks the commit, best-effort claim/refresh the `main-checkout` lock
for the committing session with `--branch` set to the current branch name, so that the
lock's `branch` field stays populated without requiring skills to call
`agent-lock.sh claim main-checkout` explicitly.

#### Scenario: Commit in main checkout updates the lock's branch field

- **GIVEN** no live foreign `main-checkout` lock exists
- **WHEN** a session commits successfully in the shared main checkout on branch `chore/y`
- **THEN** the `main-checkout` lock is claimed or refreshed with `branch=chore/y`,
  `owner_sid` set to the committing session's SID, and `heartbeat_at` updated
