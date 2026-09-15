## MODIFIED Requirements

### Requirement: SF-TEST fixtures are cleaned up in teardown regardless of test outcome

The Software Factory test helpers SHALL clean up every `is_test_data = false` fixture they
seed, even when a test assertion fails mid-body. `seed_real_feature` SHALL register each
created external_id in a file-scoped registry, and the shared `_sf_teardown` SHALL purge every
registered id at teardown time, which BATS runs regardless of the test outcome. Test bodies
SHALL NOT purge their own seeds. `purge_real_feature` SHALL refuse to delete tickets whose
title does not carry the `SF-REAL-` fixture prefix, so a wrong id can never hard-delete a real
ticket. Factory tests that require a dispatch-visible ticket SHALL use a fixture helper
that durably registers the created ticket for guarded teardown before any
fallible command or assertion. Tests SHALL NOT temporarily reclassify an
`SF-TEST` fixture as production data.

#### Scenario: seed registers the fixture for teardown cleanup

- **GIVEN** a test seeds a real feature via `seed_real_feature`
- **WHEN** the seed completes
- **THEN** the new external_id is appended to the file-scoped registry (`$BATS_FILE_TMPDIR/sf-seeded-ids`)

#### Scenario: teardown purges registered fixtures after a failing assertion

- **GIVEN** a test seeds one or more real features and then fails before reaching the end of
  its body
- **WHEN** BATS runs the teardown hook
- **THEN** every registered fixture is purged from `tickets.tickets` and no ghost row occupies
  a pool slot

#### Scenario: test bodies do not purge their own seeds

- **GIVEN** the scheduling test file `tests/spec/software-factory/scheduling.bats`
- **WHEN** its test bodies seed real features
- **THEN** no test body contains a `purge_real_feature` call — cleanup lives in teardown only

#### Scenario: purge refuses non-fixture titles

- **GIVEN** a ticket whose title does not start with `SF-REAL-`
- **WHEN** `purge_real_feature` runs against its external_id
- **THEN** the DELETE matches zero rows and the ticket remains

#### Scenario: Scheduling assertion aborts before test completion

- **GIVEN** a factory scheduling test needs an `is_test_data=false` ticket
- **WHEN** the scheduling command fails, times out, or an assertion aborts the test
- **THEN** the ticket is already registered for guarded teardown
- **AND** no `SF-TEST` row remains dispatchable in the factory queue
