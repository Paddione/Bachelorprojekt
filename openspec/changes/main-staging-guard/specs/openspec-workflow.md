# Delta: Hauptcheckout-Staging-Guard

## ADDED Requirements

### Requirement: pre-commit rejects new OpenSpec change staging in the main checkout

The system SHALL provide `scripts/openspec-main-staging-guard.sh`, wired into
`.githooks/pre-commit`, which SHALL exit 1 when a commit is attempted in the MAIN
checkout (not a linked worktree) that stages paths under a NEW `openspec/changes/<slug>/`
directory not tracked in HEAD. The guard SHALL name the offending slug in its error
message, SHALL leave already-tracked change paths and worktree checkouts untouched, and
SHALL honor a `SKIP_MAIN_STAGING_GUARD=1` bypass for documented emergencies.

#### Scenario: A new change slug is staged in the main checkout

- **GIVEN** the main checkout has a new untracked `openspec/changes/foo/` directory
- **WHEN** a commit stages files under `openspec/changes/foo/`
- **THEN** the pre-commit hook exits 1
- **AND** the error message names the slug `foo`

#### Scenario: The sanctioned flow commits the moved change in a worktree

- **GIVEN** a linked worktree where the change was moved to (opencode-flow-plan B.2)
- **WHEN** the plan-scaffold commit stages `openspec/changes/foo/` there
- **THEN** the guard exits 0 and the commit proceeds

#### Scenario: The bypass is honored

- **GIVEN** a documented emergency that requires staging a new change slug in the main checkout
- **WHEN** the commit runs with `SKIP_MAIN_STAGING_GUARD=1`
- **THEN** the guard exits 0 and the commit proceeds

#### Scenario: Already-tracked change paths stay unaffected

- **GIVEN** the main checkout with an already tracked `openspec/changes/bar/` directory
- **WHEN** a commit stages modifications under `openspec/changes/bar/`
- **THEN** the guard does not block the commit
