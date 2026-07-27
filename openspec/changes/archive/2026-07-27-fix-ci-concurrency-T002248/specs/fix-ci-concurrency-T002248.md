## ADDED Requirements

### Requirement: CI concurrency must not cancel on edited events

The CI workflow's `cancel-in-progress` setting SHALL exclude `edited` actions so that PR-title edits do not cancel running CI jobs.

#### Scenario: edited event does not cancel in-progress CI

- **GIVEN** a CI run is in progress for a PR
- **WHEN** the PR title is edited (action: `edited`)
- **THEN** the in-progress CI run SHALL NOT be cancelled

### Requirement: E2E skip without CRON_SECRET

The E2E global-db-cleanup SHALL skip the prod DB purge gracefully when `CRON_SECRET` is not set, instead of throwing an error.

#### Scenario: offline run without CRON_SECRET

- **GIVEN** Playwright runs without `CRON_SECRET` set (offline/unit run)
- **WHEN** globalSetup or globalTeardown executes
- **THEN** the purge call SHALL be skipped with a log message, not throw
