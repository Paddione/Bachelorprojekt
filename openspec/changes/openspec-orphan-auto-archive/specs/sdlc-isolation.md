## ADDED Requirements

### Requirement: The local poller dispatches archiving of orphaned OpenSpec changes

`scripts/factory/github-poller.sh` SHALL provide a task `archive` that is part of its default run and delegates to `scripts/factory/openspec-orphan-dispatch.sh [--dry-run] [--min-age-hours N]` (default 2). The dispatcher SHALL read the open changes on `main` through `gh api` rather than from the local checkout. It SHALL select a slug only when all of the following hold: the change carries a `.ticket` file, that ticket has status `done` in the ticket database, the change's first commit on `main` is older than the minimum age, and no open pull request names the slug in its title. When at least one slug is selected and no run of `openspec-orphan-archive.yml` is queued or in progress, it SHALL call `gh workflow run openspec-orphan-archive.yml -f slugs=<comma-separated slugs>` exactly once. Every skipped slug SHALL be reported with its reason. With `--dry-run` it SHALL report the selection without dispatching.

Rationale: ticket closure runs in this poller (task `merges`), independent of any session, while archiving ran only in the session's `devflow-post-merge-finalize.sh`. CI cannot reach the ticket database (ADR-006), so the done-decision has to be made here.

#### Scenario: A finished, aged change is dispatched

- **GIVEN** an open change on `main` whose ticket is `done`, first committed 3 hours ago, with no open pull request naming it
- **WHEN** the poller runs task `archive`
- **THEN** `gh workflow run openspec-orphan-archive.yml` is called once with that slug

#### Scenario: A change whose ticket is not done is skipped

- **GIVEN** an open change on `main` whose ticket has status `in_progress`
- **WHEN** the dispatcher runs
- **THEN** the slug is reported as skipped with the ticket status
- **AND** no workflow is dispatched

#### Scenario: A change inside the grace period is skipped

- **GIVEN** an open change whose ticket is `done`, first committed 30 minutes ago
- **WHEN** the dispatcher runs with the default minimum age
- **THEN** the slug is reported as skipped as too young
- **AND** no workflow is dispatched

#### Scenario: A change with an open archive pull request is skipped

- **GIVEN** an open change whose ticket is `done` and aged, and an open pull request whose title names the slug
- **WHEN** the dispatcher runs
- **THEN** the slug is reported as skipped because of the open pull request
- **AND** no workflow is dispatched

#### Scenario: A running archive workflow suppresses dispatch

- **GIVEN** a selectable change and a run of `openspec-orphan-archive.yml` in progress
- **WHEN** the dispatcher runs
- **THEN** no workflow is dispatched and the output says a run is already active

#### Scenario: Dry run selects without dispatching

- **GIVEN** a selectable change
- **WHEN** the dispatcher runs with `--dry-run`
- **THEN** the output names the slug as selected
- **AND** `gh workflow run` is not called
