# software-factory — Delta (T005591)

## ADDED Requirements

### Requirement: fixture exec failures are observable

The system SHALL make `purge_real_feature` in `tests/lib/factory-test-fixtures.sh` return a non-zero exit code and print a diagnostic to stderr when its kubectl/psql exec fails, instead of silently returning 0 as if the row were missing.

The teardown path SHALL keep its call site exit-neutral while no longer discarding stderr.

#### Scenario: failing exec is reported

- **GIVEN** a kubectl whose exec subcommand fails
- **WHEN** `purge_real_feature` runs against an existing pod
- **THEN** the function returns a non-zero exit code and its stderr names the exec failure

#### Scenario: missing row remains idempotent success

- **GIVEN** a working exec that returns no rows
- **WHEN** `purge_real_feature` runs
- **THEN** the function returns 0

### Requirement: guard skip only when verified offline

The system SHALL fail — not skip — the `scheduling-cleanup-guard` test when the database is reachable but the create path produced no row, so a broken create path cannot turn the guard green-by-skip.

#### Scenario: reachable database with empty create fails the test

- **GIVEN** a reachable database pod
- **WHEN** `ticket.sh create` fails to produce an external ID
- **THEN** the test fails instead of skipping
