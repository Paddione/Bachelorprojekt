## ADDED Requirements

### Requirement: A scheduled CI job dispatches archiving of orphaned OpenSpec changes

A scheduled job in `.github/workflows/openspec-orphan-archive.yml` SHALL detect orphaned
OpenSpec changes without database access and feed them to the existing executor. A change
SHALL count as orphaned only when all of the following hold: the change directory exists on
`main` (excluding `archive`), it carries a `.ticket` file naming a ticket, at least one
pull request with `[Tid]` in its title is merged, the change's first commit on `main` is
older than the minimum age (default 24 hours), and no open pull request names the slug in
its title. The detection SHALL live in `scripts/openspec-orphan-detect.sh` with `--dry-run`
and `--min-age-hours` options; it SHALL print one slug per line and report every skipped
slug with its reason. Manually dispatched slugs (`workflow_dispatch` inputs) SHALL take
precedence over detected slugs.

#### Scenario: A finished, aged change is dispatched

- **GIVEN** an open change on `main` with a `.ticket` file, a merged pull request carrying
  `[Tid]` in its title, first committed 30 hours ago, and no open pull request naming it
- **WHEN** the scheduled detection runs with the default minimum age
- **THEN** the slug is passed to the executor job

#### Scenario: A change without a merged fix pull request is skipped

- **GIVEN** an open change on `main` whose ticket has no merged pull request with `[Tid]`
  in its title
- **WHEN** the detection runs
- **THEN** the slug is reported as skipped with the reason and no dispatch happens

#### Scenario: A change inside the grace period is skipped

- **GIVEN** an orphaned-by-signals change first committed 2 hours ago
- **WHEN** the detection runs with the default minimum age
- **THEN** the slug is reported as skipped as too young and no dispatch happens

#### Scenario: A change with an open pull request is skipped

- **GIVEN** an orphaned-by-signals change with an open pull request naming the slug
- **WHEN** the detection runs
- **THEN** the slug is reported as skipped and no dispatch happens

#### Scenario: Manual slugs take precedence

- **GIVEN** a `workflow_dispatch` run with `slugs` inputs
- **WHEN** the workflow starts
- **THEN** the executor runs with exactly those slugs and detection is skipped
