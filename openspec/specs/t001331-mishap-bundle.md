# t001331-mishap-bundle

## Purpose

SSOT spec.

## Requirements

### Requirement: Git-crypt stale smudge detection

The system SHALL detect and auto-correct stale git-crypt smudge filters in existing worktrees
when the main checkout has been unlocked after the worktree was created in locked mode.

#### Scenario: Worktree locked → repo unlocked → stale smudge
- **GIVEN** a worktree was created while the repo was git-crypt-locked (smudge=cat)
- **WHEN** the main repo is later unlocked and `worktree-create.sh` runs for the same branch
- **THEN** the script detects the stale smudge filter via `git-crypt-guard.sh is-encrypted`
- **AND** re-initializes by copying the key and resetting the smudge filter

### Requirement: PR creation guard in dev-flow-execute

The system SHALL verify that `gh pr create` actually produced a visible PR before proceeding
to auto-merge, and SHALL return `pr_created:<pr-number>` in the subagent return contract.

#### Scenario: Archive commit without PR
- **GIVEN** the archive subagent has committed and pushed the archive branch
- **WHEN** `gh pr create` runs but fails silently
- **THEN** `gh pr view --json number` detects the missing PR and emits a FATAL error
- **AND** the orchestrator does not proceed without `pr_created:<pr-number>`

### Requirement: Ticket status/timestamp validation

The system SHALL detect tickets with inconsistent status and done_at combinations via a
standalone validation script.

#### Scenario: in_progress with done_at set
- **GIVEN** a ticket with status `in_progress` and `done_at IS NOT NULL`
- **WHEN** `ticket-status-validate.sh` runs
- **THEN** it reports the inconsistency with the ticket ID

#### Scenario: done without done_at
- **GIVEN** a ticket with status `done` and `done_at IS NULL`
- **WHEN** `ticket-status-validate.sh` runs
- **THEN** it reports the inconsistency with the ticket ID

<!-- merged from change delta t001331-mishap-bundle.md on 2026-07-01 -->