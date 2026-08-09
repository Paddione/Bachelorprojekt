## ADDED Requirements

### Requirement: Purge function tolerates missing optional tables

`tickets.fn_purge_test_data()` SHALL guard every optional-table access — including
`questionnaire_test_status` — behind an `information_schema`/`to_regclass` existence probe before
reading or writing it, so the function completes on any database where that table is absent
(schema drift, partial migration, or an older restore) instead of aborting on the first
statement and leaving all `is_test_data = true` rows unpurged.

#### Scenario: Local k3d dev DB lacks questionnaire_test_status

- **GIVEN** a `website` database where `to_regclass('questionnaire_test_status')` returns `NULL`
  (verified true for the local k3d dev cluster's `shared-db`, as opposed to fleet mentolder where
  the table exists)
- **AND** a test-data row seeded via `seed_test_feature` exists with `is_test_data = true`
- **WHEN** `tickets.fn_purge_test_data()` is invoked
- **THEN** the function completes without error
- **AND** all rows previously flagged `is_test_data = true` for that seed are gone (0 remaining)

#### Scenario: Table present (fleet)

- **GIVEN** a `website` database where `questionnaire_test_status` exists
- **WHEN** `tickets.fn_purge_test_data()` is invoked
- **THEN** the `UPDATE questionnaire_test_status SET last_failure_ticket_id = NULL WHERE …` step
  still runs exactly as before (behavior unchanged for databases that have the table)
