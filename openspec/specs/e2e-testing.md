# e2e-testing

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu e2e-testing ergänzen._

## Requirements

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

<!-- merged from change delta e2e-testing.md (5847384c1ff0) -->

<!-- consolidated from micro-spec contact-form-tab-fix [T002014] -->

### Requirement: Contact Form Tab Selection — "Nachricht" reliably clickable

The contact form tab "Nachricht" (`02 — Nachricht`) MUST be reliably clickable
by Playwright E2E tests when running against the production website.

**Previous behavior (flaky):** The tab button's accessible name was computed from
nested `<span>` text content ("02 — Nachricht Eine Frage stellen. ..."), which could
be ambiguous or slow to compute in headless CI runners.

**Fixed behavior (robust):** The tab button carries an explicit `aria-label="02 – Nachricht senden"`
that makes the accessible name deterministic regardless of text content computation.
Additionally, a `data-testid="tab-nachricht"` attribute provides a stable selector
for future test improvements.

#### Scenario: Tab "Nachricht" is clickable via accessible name
- **GIVEN** the kontakt page is loaded and all Astro islands are hydrated
- **WHEN** Playwright looks for a role `tab` with name matching `/Nachricht/i`
- **THEN** the tab button with aria-label `02 – Nachricht senden` is found
- **AND** clicking it switches the contact form to message mode

#### Scenario: Tab "Nachricht" is clickable via data-testid
- **GIVEN** the kontakt page is loaded
- **WHEN** Playwright uses `[data-testid="tab-nachricht"]`
- **THEN** the tab button for message mode is found and clickable