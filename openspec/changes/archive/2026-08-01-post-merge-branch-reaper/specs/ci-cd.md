## ADDED Requirements

### Requirement: Post-Merge Reaping of Orphaned Remote Branches

After a merge to `main`, the system SHALL delete remote branches that carry the merge commit's
ticket ID and are provably obsolete, and SHALL preserve every branch that is not.

A branch counts as obsolete only when ALL of the following hold:

1. its name contains the merge commit's ticket ID (case-insensitive),
2. no open pull request exists for it,
3. its ticket status is `done` or `archived`,
4. every file whose blob hash differs from `origin/main` matches the allowlist of plan and
   generated paths (`openspec/changes/**`, `docs/code-quality/**`, `website/src/data/**`,
   `.release-please-manifest.json`, `website/CHANGELOG.md`, `website/package.json`).

Before deleting a branch, the system SHALL push its tip SHA to `refs/tags/reaped/<branch>` on
`origin`, so the commit remains recoverable after the branch ref is gone.

The reaping step SHALL NOT block the deploy path: it runs independently of manifest detection and
is non-fatal.

#### Scenario: Branch with only plan artifacts is reaped

- **GIVEN** a remote branch whose name carries the merge commit's ticket ID
- **AND** the ticket status is `done`
- **AND** no open pull request exists for the branch
- **AND** every file differing from `origin/main` lies under `openspec/changes/`
- **WHEN** the post-merge reaper runs
- **THEN** the branch tip is pushed to `refs/tags/reaped/<branch>` on `origin`
- **AND** the remote branch is deleted

#### Scenario: Branch carrying an unmerged source file is preserved

- **GIVEN** a remote branch whose ticket status is `done` and which has no open pull request
- **AND** a file outside the allowlist differs from `origin/main`
- **WHEN** the post-merge reaper runs
- **THEN** the branch is NOT deleted
- **AND** the report names the branch and the differing file as the reason

#### Scenario: Branch with an open pull request is preserved

- **GIVEN** a remote branch that carries the merge commit's ticket ID
- **AND** an open pull request exists for that branch
- **WHEN** the post-merge reaper runs
- **THEN** the branch is NOT deleted

#### Scenario: Branch whose ticket is still open is preserved

- **GIVEN** a remote branch that carries the merge commit's ticket ID
- **AND** the ticket status is neither `done` nor `archived`
- **WHEN** the post-merge reaper runs
- **THEN** the branch is NOT deleted

#### Scenario: Merge commit without a ticket ID reaps nothing

- **GIVEN** a merge commit whose message contains no `T######` identifier
- **WHEN** the post-merge reaper runs
- **THEN** no branch is deleted
- **AND** the job exits successfully
