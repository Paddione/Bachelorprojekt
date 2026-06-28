## ADDED Requirements

### Requirement: Divergence check before worktree creation
The system SHALL verify that local `main` has `origin/main` as an ancestor before creating a new worktree.

#### Scenario: Local main is in sync
- **GIVEN** local `main` has `origin/main` as an ancestor
- **WHEN** `scripts/worktree-create.sh` runs
- **THEN** it proceeds without divergence warning

#### Scenario: Local main has diverged
- **GIVEN** local `main` has no common ancestor with `origin/main`
- **WHEN** `scripts/worktree-create.sh` runs
- **THEN** it SHALL print a clear error message and exit non-zero
- **AND** the error message SHALL include the recovery command `git reset --hard origin/main`