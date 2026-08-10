# main-commit-guard

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu main-commit-guard ergänzen._

## Requirements

### Requirement: Pre-Commit blockiert Commits auf main

The system SHALL reject commits when the current branch is `main` (or `master`), unless the commit is performed by CI automation or explicitly bypassed.

#### Scenario: Agent versucht auf main zu committen

- **GIVEN** the current branch is `main`
- **AND** the environment is NOT a CI runner (neither `CI` nor `GITHUB_ACTIONS` is set)
- **AND** `SKIP_MAIN_COMMIT_GUARD` is not set
- **WHEN** `git commit` is executed
- **THEN** the pre-commit hook SHALL exit with code 1
- **AND** stderr SHALL contain a message directing the agent to use worktree + branch + ticket + PR

#### Scenario: CI-Bot committed auf main (Freshness, Release-Please)

- **GIVEN** the current branch is `main`
- **AND** the environment variable `CI=true` or `GITHUB_ACTIONS=true` is set
- **WHEN** `git commit` is executed
- **THEN** the pre-commit hook SHALL NOT block the commit

#### Scenario: Notfall-Bypass mit SKIP_MAIN_COMMIT_GUARD

- **GIVEN** the current branch is `main`
- **AND** the environment is NOT a CI runner
- **AND** `SKIP_MAIN_COMMIT_GUARD=1` is set
- **WHEN** `git commit` is executed
- **THEN** the pre-commit hook SHALL NOT block the commit

<!-- merged from change delta main-commit-guard.md (503344dafe60) -->