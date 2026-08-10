## ADDED Requirements

### Requirement: dev-flow-chore Step 0 must not stash a main checkout a foreign process is using

`dev-flow-chore/SKILL.md` Step 0 (Reaper & Pull-First) MUST NOT run `git stash` on the main
checkout when a foreign `claude`/`opencode` process has its `cwd` inside the main checkout
AND the main checkout has uncommitted changes (the same foreign-activity detection as
`scripts/worktree-create.sh`'s divergence-guard, see `divergence-guard.md`). In that case
Step 0 skips the local `git pull --rebase origin main` and relies on the subsequent
`scripts/worktree-create.sh` call to create the worktree from `origin/main` directly — the
local `main` sync is hygiene, not a correctness requirement for the chore's worktree.

#### Scenario: Foreign session active in the main checkout skips the stash

- **GIVEN** the main checkout has uncommitted changes
- **AND** a `claude` or `opencode` process other than the current session has its `cwd`
  inside the main checkout
- **WHEN** Step 0 of `dev-flow-chore` runs
- **THEN** it does NOT run `git stash`
- **AND** the main checkout's working tree is unchanged afterward
- **AND** the skill proceeds to `scripts/worktree-create.sh` with `origin/main` as base

#### Scenario: Clean main checkout still pulls without stashing (regression guard)

- **GIVEN** the main checkout has no uncommitted changes
- **WHEN** Step 0 of `dev-flow-chore` runs
- **THEN** it runs `git pull --rebase origin main` directly, without stashing (unchanged
  behavior — positive anchor: the skip logic must not suppress the ordinary clean-tree path)
