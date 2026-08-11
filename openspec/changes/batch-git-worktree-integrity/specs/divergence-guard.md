## ADDED Requirements

### Requirement: Repository integrity is verified before worktree hygiene operations

The system SHALL verify the integrity of the shared object store before any
worktree/branch cleanup run. `scripts/git-worktree-health.sh objects` SHALL report
zero-byte loose objects (`find <git-dir>/objects -type f -size 0`) and verify the object
store with `git fsck --no-reflogs --no-progress`. The exit-code contract SHALL be 0 for a
clean store, 1 for a finding, and 2 when the check cannot be performed (no repository or
`git fsck` unusable). On a finding, the output SHALL include the documented rescue sequence:
reconstruct a worktree HEAD from its `.git/worktrees/<name>/logs/HEAD`, run
`git rebase --abort` in the affected worktree, delete the zero-byte objects, and run
`git reflog expire --stale-fix --all`, followed by a `git fsck --no-reflogs` counter-check.

#### Scenario: A single worktree carries truncated objects and blocks fetch

- **GIVEN** the repository contains zero-byte loose objects, including the detached HEAD of one worktree
- **WHEN** `git-worktree-health.sh objects` runs before the hygiene run
- **THEN** it exits 1
- **AND** it prints the rescue sequence that restores the worktree HEAD from `logs/HEAD`
- **AND** after the sequence `git fsck --no-reflogs` reports a clean store and `git fetch` works again

#### Scenario: The object store is intact

- **GIVEN** a repository without zero-byte loose objects and a clean `git fsck --no-reflogs`
- **WHEN** `git-worktree-health.sh objects` runs
- **THEN** it exits 0 without printing the rescue sequence

#### Scenario: The integrity check cannot run

- **GIVEN** a directory that is not a git repository, or a `git fsck` that fails
- **WHEN** `git-worktree-health.sh objects` runs
- **THEN** it exits 2 and prints no verdict

### Requirement: A dirty finding is confirmed by a second measurement

The per-worktree cleanliness check SHALL confirm a dirty finding with a second
`git status --porcelain` run before reporting it. Only residues reported identically by
both runs are a finding. A residue that appears only in the first run SHALL be treated as a
stat-cache refresh artifact (stale mtimes after a crash) and SHALL NOT block a removal or
trigger a ticket assignment.

#### Scenario: A transient dirty report after a crash is not a finding

- **GIVEN** a worktree whose file mtimes differ from the index stat cache (e.g. after a crash)
- **WHEN** the cleanliness check runs its first `git status --porcelain`
- **AND** the first run reports modified files whose content is identical to the index
- **THEN** the second run reports no residues
- **AND** the check exits 0 and notes that the stat cache was refreshed

#### Scenario: A persistent dirty state is still a finding

- **GIVEN** a worktree with genuinely modified, non-allowlisted files
- **WHEN** the cleanliness check runs twice
- **THEN** both runs report the same residues
- **AND** the check exits 1

### Requirement: Worktree iteration is registration-based, orphan directories are a finding

Worktree enumeration in hygiene and ticket-ops flows SHALL iterate over
`git worktree list --porcelain` (the registration), not over the filesystem glob
`.worktrees/*/`. A directory under `.worktrees/` that has no entry in the porcelain output
SHALL be reported as a finding by `scripts/git-worktree-health.sh orphans` — orphaned
directories are either garbage or lost work and SHALL be named, never silently counted as a
clean worktree. Any `git -C <dir>` call in such a loop SHALL be guarded by
`[ -e "$dir/.git" ]` so that git's upward search cannot answer for the parent repository.

#### Scenario: An orphan directory is measured against the parent repository

- **GIVEN** a directory `.worktrees/<name>` that contains no `.git` and is not registered in `git worktree list`
- **WHEN** a hygiene loop enumerates worktrees via the `.worktrees/*/` glob
- **THEN** the loop SHALL NOT report `branch=main, dirty=0` for it
- **AND** `git-worktree-health.sh orphans` SHALL name the directory as a finding

#### Scenario: Registered worktrees are enumerated via porcelain

- **GIVEN** a repository with several registered worktrees
- **WHEN** a hygiene or ticket-ops flow enumerates worktrees
- **THEN** the enumeration matches `git worktree list --porcelain` exactly

### Requirement: The auto-stash restore resolves the stash by message, not by index

`scripts/worktree-create.sh` SHALL restore its automatically created stash
(`worktree-create-auto-stash`) by locating the entry through its message, never by the
positional index `stash@{0}`. The shared stash stack (`refs/stash` in the common git dir)
is mutated by every worktree in the repository, so a positional index is not stable.
`scripts/git-stash-net.sh` SHALL provide message-based operations (`find --by-ticket`,
`pop --by-message`) as the reference implementation and SHALL drop an entry only when the
pop applied completely.

#### Scenario: A foreign push shifted the stash indices

- **GIVEN** a shared stash stack where a foreign session pushed new entries above `stash@{0}`
- **WHEN** `worktree-create.sh` restores its auto-stash
- **THEN** it locates the entry by the message `worktree-create-auto-stash`, not by `stash@{0}`

#### Scenario: A partial pop keeps the safety net entry

- **GIVEN** a stash whose pop applies only partially (a file was regenerated in between)
- **WHEN** `git-stash-net.sh pop --by-message` runs
- **THEN** it reports the partial pop as a finding and keeps the stash entry
