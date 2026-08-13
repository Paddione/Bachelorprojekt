## ADDED Requirements

### Requirement: Teardown-Purge installiert die Repo-Funktion vor dem Aufruf

`purge_factory_test_data()` (tests/lib/factory-test-fixtures.sh) SHALL, before invoking
`tickets.fn_purge_test_data()`, verify that the repository's latest purge-function version
(neueste `scripts/one-shot/purge-fn-v*.sql`) is deployed on the target database, and SHALL
install it (idempotent `CREATE OR REPLACE FUNCTION`) when its `RUNTIME-CHECK` marker is absent
from `pg_proc.prosrc`. Deployment state of the manually-applied one-shot migrations SHALL NOT
determine whether the test-data purge succeeds.

#### Scenario: Function missing or stale on the local dev database

- **GIVEN** a reachable local `shared-db` whose `tickets.fn_purge_test_data()` does not carry the
  marker declared by the latest `scripts/one-shot/purge-fn-v*.sql`
- **WHEN** `purge_factory_test_data <brand>` is invoked
- **THEN** the latest purge-function SQL file is applied first (exit 0)
- **AND** the purge completes and removes the seeded `is_test_data = true` rows

#### Scenario: Function already current

- **GIVEN** a database whose `tickets.fn_purge_test_data()` carries the marker of the latest
  `scripts/one-shot/purge-fn-v*.sql`
- **WHEN** `purge_factory_test_data <brand>` is invoked
- **THEN** no re-application happens and the purge runs as before (behavior unchanged)

### Requirement: Runtime drift of the purge function is visible in the local test loop

The local test loop (`task test:changed`) SHALL run `scripts/runtime-drift-check.sh` and SHALL
report a stale `tickets.fn_purge_test_data()` (missing `RUNTIME-CHECK` marker) as a hard failure,
so a merged DB fix that is not deployed cannot silently rot. The drift check's shared-db pod
selector SHALL match the fixture resolution (`app in (shared-db, shared-db-dev)`).

#### Scenario: Stale purge function on the local dev database

- **GIVEN** a local `shared-db` running an old purge-function version without the marker declared
  in `scripts/one-shot/purge-fn-v8.sql`
- **WHEN** `task test:changed` runs
- **THEN** the drift check exits non-zero and reports
  `DB-Funktion tickets.fn_purge_test_data traegt Marker ... nicht`

#### Scenario: No cluster reachable (CI)

- **GIVEN** an environment without a reachable `shared-db` pod (CI runner)
- **WHEN** `task test:changed` runs
- **THEN** the drift check skips gracefully and does not fail the run

### Requirement: Purge-function migrations carry the drift-check marker

Every new purge-function migration (`scripts/one-shot/purge-fn-v*.sql`, newest file) SHALL carry a
`-- RUNTIME-CHECK: function=<schema>.<function> marker=<substring>` comment line so the
runtime-drift-check (T003825) can verify its deployment. An offline BATS guard
(`tests/unit/purge-fn-gaps.bats`) SHALL assert this contract on every version bump.

#### Scenario: A new purge-fn version is added without the marker

- **GIVEN** a new `scripts/one-shot/purge-fn-v9.sql` without a `RUNTIME-CHECK:` line
- **WHEN** the BATS guard `purge-fn-gaps` runs (CI, no cluster needed)
- **THEN** the guard fails and the marker must be added before merge
