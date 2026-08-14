## ADDED Requirements

### Requirement: Freshness-Regen Branches Are Reaped by PR Status

In sweep mode, the branch reaper SHALL treat remote branches matching the pattern
`chore/freshness-regen-*` as candidates even though their names carry no `T######` ticket
identifier. For this branch class the pull request status SHALL replace the ticket status as
deletion criterion: a branch whose associated pull request (resolved via
`gh pr list --head <branch> --state all`) is `MERGED` or `CLOSED` SHALL proceed to the blob
divergence check, while a branch whose pull request is `OPEN`, whose pull request cannot be
found, or whose `gh` query fails SHALL be preserved with a reason. An unverifiable criterion
SHALL preserve the branch, never release it.

The blob divergence check (every differing blob between the branch and `<remote>/main` must
match the existing path allowlist) SHALL apply unchanged to this branch class. The branch SHALL
be reported as a `REAP` candidate only when a `MERGED` or `CLOSED` pull request exists AND no
differing file falls outside the allowlist.

The rule SHALL be scoped to the `chore/freshness-regen-*` pattern: any other branch without a
ticket identifier in its name SHALL keep the existing preservation behavior with its existing
reason, in sweep mode and single-ticket mode alike. Single-ticket mode SHALL remain unchanged:
candidate selection still requires the ticket identifier in the branch name.

The deletion mechanics (archive tag `refs/tags/reaped/<branch>` before any delete, local ref
reaping, output contract `REAP`/`KEEP`/`DELETED`) SHALL remain unchanged.

#### Scenario: A merged freshness-regen branch with allowlist-only divergence is reaped

- **GIVEN** a remote branch named `chore/freshness-regen-<run-id>` whose pull request is
  `MERGED` and whose only differing files from `<remote>/main` match the path allowlist
- **WHEN** the ticketless sweep runs in dry-run mode
- **THEN** the branch is reported as a `REAP` candidate

#### Scenario: A closed freshness-regen branch is reaped

- **GIVEN** a remote branch named `chore/freshness-regen-<run-id>` whose pull request is
  `CLOSED` (never merged) and whose only differing files match the path allowlist
- **WHEN** the ticketless sweep runs in dry-run mode
- **THEN** the branch is reported as a `REAP` candidate

#### Scenario: A freshness-regen branch with an open pull request is preserved

- **GIVEN** a remote branch named `chore/freshness-regen-<run-id>` whose pull request is
  `OPEN` (auto-merge still pending)
- **WHEN** the ticketless sweep runs in dry-run mode
- **THEN** the branch is preserved with a reason
- **AND** no `REAP` line mentions the branch

#### Scenario: A freshness-regen branch without a findable pull request is preserved

- **GIVEN** a remote branch named `chore/freshness-regen-<run-id>` for which
  `gh pr list --head <branch> --state all` returns no pull request
- **WHEN** the ticketless sweep runs in dry-run mode
- **THEN** the branch is preserved with a reason

#### Scenario: A freshness-regen branch diverging outside the allowlist is preserved

- **GIVEN** a remote branch named `chore/freshness-regen-<run-id>` whose pull request is
  `MERGED`
- **AND** a differing file between the branch and `<remote>/main` that does not match the path
  allowlist
- **WHEN** the ticketless sweep runs in dry-run mode
- **THEN** the branch is preserved with a reason naming the diverging file

#### Scenario: The rule does not leak to other branches without ticket identifiers

- **GIVEN** a remote branch without a `T######` identifier that does not match
  `chore/freshness-regen-*`
- **WHEN** the ticketless sweep runs in dry-run mode
- **THEN** the branch is preserved with the existing reason for missing ticket identifiers
- **AND** no `REAP` line mentions the branch
