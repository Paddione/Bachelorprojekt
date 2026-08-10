## ADDED Requirements

### Requirement: Reaping removes the local branch ref when it is covered by the archive tag

After the branch reaper has successfully deleted a remote branch, it SHALL also delete the
local branch ref of the same name, but only when that local ref resolves to exactly the SHA
that was pushed to `refs/tags/reaped/<branch>`.

When the local ref resolves to a different SHA — it carries commits that were never pushed and
are therefore not covered by the archive tag — the reaper SHALL preserve it and SHALL report
that it was preserved together with the reason. A local ref that does not exist at all is not
an error and SHALL NOT change the exit status.

The local deletion SHALL NOT be attempted for the currently checked-out branch, which is
already excluded from reaping, and a failure to delete the local ref SHALL NOT undo or mask the
completed remote deletion.

#### Scenario: Local ref pointing at the archived SHA is deleted

- **GIVEN** a remote branch that satisfies all four reaping conditions
- **AND** a local branch of the same name resolving to the same SHA as the remote tip
- **WHEN** the reaper runs without `--dry-run`
- **THEN** the tip SHA is pushed to `refs/tags/reaped/<branch>` on `origin`
- **AND** the remote branch is deleted
- **AND** `git rev-parse --verify refs/heads/<branch>` no longer resolves

#### Scenario: Local ref with unpushed commits is preserved

- **GIVEN** a remote branch that satisfies all four reaping conditions
- **AND** a local branch of the same name that is ahead of the remote tip
- **WHEN** the reaper runs without `--dry-run`
- **THEN** the remote branch is deleted
- **AND** `git rev-parse --verify refs/heads/<branch>` still resolves to the unchanged local SHA
- **AND** the report names the branch as locally preserved

#### Scenario: No local ref exists

- **GIVEN** a remote branch that satisfies all four reaping conditions
- **AND** no local branch of that name in the target repository
- **WHEN** the reaper runs without `--dry-run`
- **THEN** the remote branch is deleted
- **AND** the reaper exits successfully
