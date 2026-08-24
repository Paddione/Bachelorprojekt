# db-identity-guard

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu db-identity-guard ergänzen._

## Requirements

### Requirement: Shared-db pod selection is unambiguous

The system SHALL resolve the shared-db pod only when exactly one Running pod matches the selector
`app in (shared-db, shared-db-dev)` in the target namespace; an ambiguous match SHALL abort with a
loud error listing all candidate pods before any SQL is executed.

#### Scenario: Two running shared-db pods (ghost class)

- **GIVEN** two Running pods match the shared-db selector in the namespace
- **WHEN** any ticket command resolves the database pod via `_pgpod`
- **THEN** the command exits non-zero with an error naming both pods and the remediation
- **AND** no `kubectl exec` against either pod has been performed

#### Scenario: Single running pod resolves normally

- **GIVEN** exactly one Running pod matches the selector
- **WHEN** `_pgpod` runs
- **THEN** it returns that pod without additional output

### Requirement: Database identity marker probe

The system SHALL verify, once per process after pod resolution, that the resolved database carries
the identity marker (`tickets.db_identity`, single row, fixed UUID constant written by migration
`migrations/20260824-db-identity-marker.sql`) before any ticket command uses the connection.
A missing or mismatched marker SHALL abort the command fail-closed with a remediation message
naming the migration task.

#### Scenario: Ghost instance without marker

- **GIVEN** the resolved pod serves a database without the `tickets.db_identity` marker row
- **WHEN** a ticket command (read or write) runs
- **THEN** the command exits non-zero with an error naming the missing marker and the exact
  remediation command (`task db:migrate ENV=mentolder`)
- **AND** no write statement has reached the database

#### Scenario: Marker mismatch

- **GIVEN** the resolved database carries a marker value different from the expected constant
- **WHEN** a ticket command runs
- **THEN** the command aborts with a mismatch error naming both values

#### Scenario: Escape hatch for bootstrap and frozen history

- **GIVEN** `TICKET_ALLOW_UNVERIFIED_DB=1` is set
- **WHEN** the marker probe fails or mismatches
- **THEN** the command prints a `WARN:` line to stderr and continues

#### Scenario: BATS sentinel regime skips the probe

- **GIVEN** a test runs under the T002224 BATS sentinel regime (no `TICKET_TEST_DB_OK=1`)
- **WHEN** a ticket command exercises `_pgpod`
- **THEN** the marker probe is skipped entirely
- **AND** the pod singleton assertion remains active

### Requirement: Identity constant parity between migration and guard

The system SHALL keep the identity UUID constant identical in the migration file and in
`scripts/vda/ticket/_ticket-core.sh`; a structural test SHALL fail when the two literals diverge.

#### Scenario: Constants diverge

- **GIVEN** the UUID literal in the migration file differs from the one in `_ticket-core.sh`
- **WHEN** the db-guard test suite runs
- **THEN** the parity test fails naming both files

<!-- merged from change delta db-identity-guard.md (53adf395ca0b) -->