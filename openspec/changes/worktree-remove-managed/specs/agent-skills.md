## ADDED Requirements

### Requirement: Removal of managed worktrees unlocks before removing

The repository SHALL provide `scripts/lib/worktree-remove.sh` (source-only) with `worktree_remove_managed <repo> <path>`. The function SHALL return non-zero with a message when `<path>` is not a registered worktree of `<repo>`; otherwise it SHALL unlock the worktree and then run `git worktree remove --force` on it, returning that command's exit status. `scripts/devflow-post-merge-finalize.sh` (step 10), `scripts/pr-refresh.sh`, `scripts/weekly-dep-schema-audit.sh` and the EXIT trap of `scripts/factory/cleanup.sh` SHALL remove worktrees only through this function. The cleanup instructions in the `git-workflow`, `dev-flow-chore`, `dev-flow-execute` and `repo-hygiene` skill references SHALL unlock before `git worktree remove`.

Rationale: since T900046 `scripts/worktree-create.sh` locks every worktree it creates (reason `managed agent worktree`). `git worktree remove --force` refuses a locked worktree (`fatal: cannot remove a locked working tree`, exit 128); only an unlock or a doubled `--force` removes it. Step 10 of the finalize script therefore aborted with exit 1 and skipped every later step, while the other callers swallowed the error and left worktrees behind.

#### Scenario: A locked worktree is removed

- **GIVEN** a worktree locked with reason `managed agent worktree`
- **WHEN** `worktree_remove_managed <repo> <path>` runs
- **THEN** it exits zero
- **AND** the path no longer exists and is no longer listed by `git worktree list`

#### Scenario: An unlocked worktree is removed

- **GIVEN** a worktree without a lock
- **WHEN** `worktree_remove_managed <repo> <path>` runs
- **THEN** it exits zero and the worktree is gone

#### Scenario: A path that is not a registered worktree is refused

- **GIVEN** a directory that is not registered as a worktree of the repository
- **WHEN** `worktree_remove_managed <repo> <path>` runs
- **THEN** it exits non-zero and the directory is left in place

#### Scenario: Finalize step 10 removes a locked worktree

- **GIVEN** the step-10 removal block of `scripts/devflow-post-merge-finalize.sh` and a locked worktree
- **WHEN** the block runs against that worktree
- **THEN** it reports the worktree as removed and exits zero
