## ADDED Requirements

### Requirement: Automated conflict healing for generated artifacts

The system SHALL provide a `pr:refresh` task that rebases a conflicting pull request
branch onto `origin/main`, regenerates the freshness artifacts, and force-pushes the
result, so that conflicts confined to generated artifacts no longer require manual work.

The `.gitattributes` file already declares `merge=ours` for the generated artifacts and the
local merge driver is configured, so a local rebase resolves them without conflict markers.
GitHub ignores `.gitattributes` merge drivers entirely when computing mergeability, which is
why such pull requests remain `CONFLICTING` despite being trivially resolvable locally.

#### Scenario: Conflict limited to generated artifacts is healed

- **GIVEN** a pull request whose only merge conflicts are in files marked
  `linguist-generated=true` in `.gitattributes`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the branch is rebased onto `origin/main`, the freshness artifacts are
  regenerated and committed, and the branch is force-pushed with `--force-with-lease`
- **AND** the pull request reports `mergeable=MERGEABLE` afterwards

#### Scenario: Conflict in a non-generated file aborts the run

- **GIVEN** a pull request with a merge conflict in a file that is NOT marked
  `linguist-generated=true`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the rebase is aborted, the branch is left untouched, and the command exits
  non-zero naming the conflicting file
- **AND** no force-push occurs

#### Scenario: Branch owned by a live session is refused

- **GIVEN** a pull request whose head branch is listed as `live` by `agent-lock.sh list`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the command exits non-zero without touching the branch, naming the owning
  session
- **AND** no force-push occurs

#### Scenario: Pull request of another author is refused

- **GIVEN** a pull request authored by an account other than the authenticated user
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the command exits non-zero and performs no force-push

#### Scenario: Already mergeable pull request is skipped

- **GIVEN** a pull request reporting `mergeable=MERGEABLE`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the command reports that no action is needed and exits zero without rebasing

#### Scenario: Dry run performs no mutation

- **GIVEN** any pull request in any state
- **WHEN** `task pr:refresh -- --dry-run <number>` runs
- **THEN** the command reports the actions it would take and exits zero
- **AND** no rebase, commit, or push occurs
