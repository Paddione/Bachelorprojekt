## ADDED Requirements

### Requirement: Interrupted git operation check at the worktree target path

`scripts/worktree-create.sh` SHALL detect an interrupted git operation (`rebase-merge`,
`rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`) in an existing worktree at the requested
target path and SHALL abort with the dedicated exit code `5` before removing it. The abort
SHALL leave the worktree, its git state directory and its uncommitted conflict resolution
untouched, and the message SHALL name the target path.

The check SHALL be scoped to the target path only. An interrupted operation in any other
registered worktree SHALL NOT prevent creation at a different path, because a foreign
worktree may legitimately sit mid-operation and a repository-wide abort would stall every
subsequent creation, including the Software Factory's per-ticket calls.

The emergency bypass `WT_ALLOW_INTERRUPTED_OP=1` SHALL downgrade the abort to a warning on
stderr and proceed, mirroring the existing `WT_SKIP_NAME_CHECK` escape hatch.

#### Scenario: Target path holds a worktree mid-rebase

- **GIVEN** a worktree at the requested target path with a conflicted rebase whose conflicts
  are resolved and staged but never continued
- **WHEN** `scripts/worktree-create.sh <branch> <that path>` runs
- **THEN** the command exits with code 5
- **AND** the message contains the target path
- **AND** the rebase state directory still exists after the run
- **AND** the resolved but uncommitted working-tree content is unchanged

#### Scenario: Target path holds a clean worktree

- **GIVEN** a worktree at the requested target path with no interrupted git operation
- **WHEN** `scripts/worktree-create.sh <branch> <that path>` runs
- **THEN** the command exits with code 0 and the worktree is reused as before

#### Scenario: A different worktree is mid-rebase

- **GIVEN** some other registered worktree sits in an interrupted rebase
- **AND** the requested target path holds no worktree
- **WHEN** `scripts/worktree-create.sh <branch> <target path>` runs
- **THEN** the command exits with code 0 and creates the worktree

#### Scenario: Emergency bypass is set

- **GIVEN** a worktree at the requested target path with an interrupted git operation
- **AND** the environment variable `WT_ALLOW_INTERRUPTED_OP` is set to `1`
- **WHEN** `scripts/worktree-create.sh <branch> <that path>` runs
- **THEN** the command exits with code 0
- **AND** a warning naming the interrupted operation is written to stderr

### Requirement: Single-worktree scoping flag on the git operation guard

`scripts/worktree-git-op-guard.sh` SHALL accept `--worktree <path>` to restrict its inspection
to exactly that worktree, so callers that care about one path do not have to reimplement the
state-directory probe. Without the flag the guard SHALL keep its repository-wide behaviour and
its existing exit codes (0 = no finding, 1 = at least one finding, 2 = invocation error).

#### Scenario: Guard scoped to a clean worktree while another is mid-rebase

- **GIVEN** a repository with one clean worktree and one worktree mid-rebase
- **WHEN** `scripts/worktree-git-op-guard.sh --worktree <the clean worktree>` runs
- **THEN** it exits 0

#### Scenario: Guard scoped to the worktree that is mid-rebase

- **GIVEN** the same repository
- **WHEN** `scripts/worktree-git-op-guard.sh --worktree <the mid-rebase worktree>` runs
- **THEN** it exits non-zero and names that worktree
