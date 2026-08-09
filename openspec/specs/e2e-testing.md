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

### Requirement: Exactly one contentinfo landmark per rendered page

A brand page SHALL render exactly one `<footer>` element at document level. Section-level
footer blocks inside `<main>` SHALL use a non-landmark element, so that
`getByRole('contentinfo')` resolves to a single node under Playwright strict mode and no
landmark is nested inside another landmark.

#### Scenario: The Kore homepage contributes no footer landmark

- **GIVEN** the korczewski homepage rendered with the Kore layout
- **WHEN** the document is queried for elements with role `contentinfo`
- **THEN** exactly one is found, and it is the layout footer

#### Scenario: The section block keeps its appearance

- **GIVEN** the former `w-foot` block now rendered as a non-landmark element
- **WHEN** the page is styled
- **THEN** the `w-foot` class rules apply unchanged, so the visual result is identical

### Requirement: The brand link carries an explicit accessible name

The navigation brand link SHALL carry an `aria-label` naming the brand and its
destination, rather than relying on its text content for its accessible name. E2E specs
SHALL address it by that label.

#### Scenario: Screen reader announces destination

- **GIVEN** the brand link in the site navigation
- **WHEN** its accessible name is computed
- **THEN** it names both the brand and that the link leads to the start page
- **AND** the decorative logo remains excluded via `aria-hidden`

### Requirement: Brand text assertions match the shipped wording

E2E assertions on brand wording SHALL match the content actually shipped: the footer
assertion SHALL be case-insensitive, because the `contentinfo` landmark spells the brand
in lowercase, and the `/ueber-mich` heading assertion SHALL match the portrait heading
introduced by the Kore redesign.

#### Scenario: Footer assertion tolerates the lowercase wordmark

- **GIVEN** a `contentinfo` landmark containing `© 2026 korczewski.de`
- **WHEN** the footer brand assertion runs
- **THEN** it passes without requiring a capitalised spelling

#### Scenario: About page heading assertion matches the portrait heading

- **GIVEN** `/ueber-mich` rendering a personal portrait heading
- **WHEN** the heading assertion runs
- **THEN** it passes against that heading

<!-- merged from change delta e2e-testing.md (6226376e1790) -->

### Requirement: Systemtest Purge Endpoint Positive Assertion

The E2E test suite SHALL verify systemtest infrastructure routes under `/sdlc/api/systemtest/` using explicit positive status assertions (such as 403 Forbidden when unauthenticated) rather than negative status assertions.

#### Scenario: Unauthenticated request to purge endpoint returns 403

- **GIVEN** the application systemtest endpoint `/sdlc/api/systemtest/purge-all-test-data` is deployed
- **WHEN** an unauthenticated POST request is sent to the endpoint
- **THEN** the server returns HTTP status 403 Forbidden

<!-- merged from change delta e2e-testing.md (3cd492847b1b) -->