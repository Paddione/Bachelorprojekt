## ADDED Requirements

### Requirement: Divergence-Guard skips the auto-stash when a foreign process holds the main checkout dirty

`scripts/worktree-create.sh`'s divergence-guard sync path (local `main` behind `origin/main`)
SHALL NOT run `git stash push` on the main checkout when BOTH of the following hold:

- a foreign `claude` or `opencode` process has its `cwd` inside the main checkout (detected
  via `/proc/<pid>/cwd`, excluding the current session's own PID/parent chain), AND
- `git status --porcelain` on the main checkout is non-empty.

In that case the guard SHALL print a warning naming the skipped sync and proceed to create
the worktree from `origin/main` directly (`BASE=origin/main`), without mutating the main
checkout. The existing safeguard against the script's OWN failed `stash pop`
(`_wc_stash_pop_or_warn`, T002673) remains unchanged and still applies whenever a stash IS
performed (i.e. the foreign-activity guard did not fire).

#### Scenario: Foreign session with uncommitted changes blocks the auto-stash

- **GIVEN** local `main` is behind `origin/main`
- **AND** the main checkout has uncommitted changes (`git status --porcelain` non-empty)
- **AND** a `claude` or `opencode` process other than the current session has its `cwd`
  inside the main checkout
- **WHEN** `scripts/worktree-create.sh` runs the divergence-guard sync path
- **THEN** it does NOT run `git stash push` on the main checkout
- **AND** the main checkout's working tree is unchanged afterward (same uncommitted diff as
  before the run)
- **AND** the new worktree is created successfully from `origin/main`

#### Scenario: Dirty checkout without any foreign process still auto-stashes (regression guard)

- **GIVEN** local `main` is behind `origin/main`
- **AND** the main checkout has uncommitted changes
- **AND** no foreign `claude`/`opencode` process has its `cwd` inside the main checkout
- **WHEN** `scripts/worktree-create.sh` runs the divergence-guard sync path
- **THEN** it stashes, pulls, and pops as before (unchanged behavior — this is the
  positive-anchor case for the guard above: it must still stash when there is no foreign
  activity to protect)
