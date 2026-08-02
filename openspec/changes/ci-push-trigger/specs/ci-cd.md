## ADDED Requirements

### Requirement: Branch commits SHALL NOT carry CI skip markers

Commits created on a feature, fix or chore branch SHALL NOT contain any of
GitHub's workflow skip markers in their commit message: `[skip ci]`,
`[ci skip]`, `[no ci]`, `[skip actions]` or `[actions skip]`.

Rationale: a squash merge folds the subjects of all branch commits into the
body of the resulting `main` commit. GitHub evaluates skip markers against the
entire message of the head commit, so a marker originating on a branch
suppresses every push-triggered workflow on `main` — silently, with no failed
run to observe.

This requirement does not apply to bot commits pushed directly to `main`
without a pull request, which use the marker deliberately as loop protection.

#### Scenario: Worktree anchor commit carries no skip marker

- **GIVEN** a repository in which `scripts/worktree-create.sh` creates a new
  branch
- **WHEN** the helper writes its empty anchor commit
- **THEN** the anchor commit exists on the new branch
- **AND** its commit message contains no CI skip marker

#### Scenario: The guard rejects a branch commit carrying a skip marker

- **GIVEN** a branch whose commits ahead of `main` include one whose message
  contains `[skip ci]`
- **WHEN** `scripts/check-skip-ci-marker.sh` runs against that range
- **THEN** it exits non-zero
- **AND** it names the offending commit

#### Scenario: The guard accepts a branch without skip markers

- **GIVEN** a branch whose commits ahead of `main` contain no skip marker
- **WHEN** `scripts/check-skip-ci-marker.sh` runs against that range
- **THEN** it exits zero

#### Scenario: The pull request pipeline invokes the guard

- **GIVEN** the `ci.yml` workflow
- **WHEN** it runs for a `pull_request` event
- **THEN** it invokes `scripts/check-skip-ci-marker.sh`, so the check fails
  before the merge rather than after it
