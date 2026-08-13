## ADDED Requirements

### Requirement: Local Branch Ref is Reaped after Remote Deletion

After successfully deleting a remote branch, the branch reaper SHALL also delete the matching
local branch ref in the target repository — but only when that ref points to the exact SHA
that was archived as `refs/tags/reaped/<branch>`. The local ref is the same commit under a
different name, so removing it loses nothing: the commit stays recoverable via the archive
tag.

A local ref SHALL be preserved whenever its SHA differs from the archived remote SHA: such a
ref carries commits that were never on the remote, and deleting it would destroy unreachable
work. A local ref SHALL also be preserved when the local deletion fails (for example because
the branch is checked out in another worktree); the failure SHALL be reported as a
`KEEP local <branch>` line rather than treated as a reaper error. When no local ref exists,
the existing `DELETED <branch>` report SHALL remain unchanged.

The safety condition SHALL be checked before every local deletion; SHA equality is the only
permission to delete the local ref.

#### Scenario: Local ref on the archived SHA is deleted

- **GIVEN** a remote branch that the reaper deletes
- **AND** a local branch ref of the same name in the target repository
- **AND** the local ref points to the same SHA as the archived remote branch tip
- **WHEN** the reaper finishes the remote deletion
- **THEN** the local branch ref is deleted as well
- **AND** the report line keeps the `DELETED <branch>` prefix and states that the local ref
  was removed

#### Scenario: Local ref with unmerged commits is preserved

- **GIVEN** a remote branch that the reaper deletes
- **AND** a local branch ref of the same name that points to a different SHA (local commits
  never pushed to the remote)
- **WHEN** the reaper finishes the remote deletion
- **THEN** the local branch ref is NOT deleted
- **AND** the report explains the preservation in a `KEEP local <branch>` line
- **AND** the remote deletion is still reported as before

#### Scenario: Local ref checked out in a worktree is preserved

- **GIVEN** a remote branch that the reaper deletes
- **AND** a local branch ref of the same name on the archived SHA
- **AND** the branch is checked out in another worktree, so `git branch -D` fails
- **WHEN** the reaper finishes the remote deletion
- **THEN** the local branch ref is NOT deleted
- **AND** the report explains the preservation in a `KEEP local <branch>` line
- **AND** the reaper run still exits successfully

#### Scenario: No local ref exists

- **GIVEN** a remote branch that the reaper deletes
- **AND** no local branch ref of the same name in the target repository
- **WHEN** the reaper finishes the remote deletion
- **THEN** the existing `DELETED <branch>` report line is emitted unchanged
