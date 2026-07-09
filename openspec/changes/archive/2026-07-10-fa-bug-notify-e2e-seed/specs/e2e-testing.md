## ADDED Requirements

### Requirement: FA-bug-notify seeds and cleans up its own fixture ticket

The `FA-bug-notify` E2E spec SHALL seed its test ticket via a direct
database insert (`is_test_data = true`) instead of the public
`POST /api/bug-report` route, and SHALL delete that row in an `afterEach`
hook regardless of test outcome, so the fixture ticket is never visible in
the real triage queue longer than the duration of the test itself.

#### Scenario: Fixture ticket is removed even when the test fails mid-run

- **GIVEN** the `FA-bug-notify` test has seeded a ticket directly in
  `tickets.tickets` with `is_test_data = true`
- **WHEN** a later step in the same test (e.g. the admin resolve call)
  throws and the test fails
- **THEN** the `afterEach` hook still deletes the seeded ticket row by its
  `external_id`, leaving no orphaned fixture ticket in the database

#### Scenario: Test skips cleanly without direct DB access

- **GIVEN** `SESSIONS_DATABASE_URL` or `CRON_SECRET` is not set in the
  environment
- **WHEN** the `FA-bug-notify` test runs
- **THEN** it skips before seeding anything, exactly as it did before this
  change
