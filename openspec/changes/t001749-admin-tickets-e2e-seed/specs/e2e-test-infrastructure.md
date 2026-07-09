## Purpose

`tests/e2e/specs/fa-admin-tickets.spec.ts` rief bisher zur Laufzeit
`createTestBugReport()` (aus `tests/e2e/lib/e2e-marker.ts`) auf, das die
Bug-Report-Schnittstelle `POST /api/bug-report` mit dem
`X-Cron-Secret`-Header benutzte. Das ist für CI-E2E-Tests die falsche
Abstraktionsebene — der Test sollte die Datenbank nicht über einen
HTTP-Pfad verschmutzen, wenn er einen direkten Insert machen kann. Der
Plan etabliert ein DB-Level-Seed-Helper-Modul (`tests/e2e/lib/e2e-seed.ts`),
das den POST umgeht, die Zeile mit `is_test_data=true` stempelt und im
`finally`-Block wieder aufräumt.

## ADDED Requirements

### Requirement: E2E-DB-Seed-Helper-Modul

The system SHALL provide a TypeScript helper module
`tests/e2e/lib/e2e-seed.ts` that exposes the following public symbols
for E2E tests that need to seed `tickets.tickets` rows without going
through `POST /api/bug-report`:

- `seedAvailable(): boolean` — returns `true` iff both
  `process.env.CRON_SECRET` and `process.env.SESSIONS_DATABASE_URL` are
  set to non-empty strings.
- `seedAdminTicket(input: { testId: string; status?: …; description?: string; url?: string; reporterEmail?: string; isTestData?: boolean }): Promise<{ id: string; externalId: string; reporterEmail: string }>`
  — opens a short-lived `pg.Pool` against `SESSIONS_DATABASE_URL`,
  executes `INSERT INTO tickets.tickets (type, brand, title, description, url, reporter_email, status, is_test_data) VALUES ('bug', $1, $2, $3, $4, $5, $6, $7) RETURNING id, external_id`,
  and returns the new UUID + external_id + effective reporter email.
  `type` is always `'bug'`. `brand` defaults to
  `process.env.E2E_BRAND ?? 'mentolder'`. `is_test_data` defaults to
  `true` and SHALL be set to `true` by default so the server-side
  `tickets.fn_purge_test_data()` sweep reaps the row at the next
  bracket.
- `seedTicketComment(input: { ticketId: string; authorLabel: string; body: string; visibility?: 'internal' | 'public'; kind?: 'comment' | 'status_change' | 'system' }): Promise<{ id: number }>`
  — inserts a `tickets.ticket_comments` row for the given ticket id.
  Used by tests that need a deterministic timeline fixture.
- `cleanupSeedTicket(id: string): Promise<void>` — hard-deletes the
  ticket with `is_test_data=true` guard; FK-CASCADE removes
  `ticket_comments`, `ticket_activity`, and `ticket_links` linked to
  the row. SHALL be a no-op when `seedAvailable()` returns `false`.
- `cleanupSeedTickets(ids: ReadonlyArray<string>): Promise<void>` —
  bulk variant that takes a list of UUIDs and uses
  `id = ANY($1::uuid[]) AND is_test_data = true`.

Every function in the helper SHALL throw a descriptive error
(`'seedAdminTicket ohne CRON_SECRET+SESSIONS_DATABASE_URL …'`) when
called without the gate set, so a missing-gate test fails loudly
instead of silently producing a `200` with no row.

#### Scenario: seedAvailable returns true only when both env vars are set

- **GIVEN** the process environment
- **WHEN** `seedAvailable()` is called
- **THEN** it returns `true` iff both `CRON_SECRET` and
  `SESSIONS_DATABASE_URL` are non-empty strings
- **AND** it returns `false` when either is missing or empty

#### Scenario: seedAdminTicket stamps is_test_data=true by default

- **GIVEN** `seedAvailable()` returns `true` and a fresh `testId`
- **WHEN** `seedAdminTicket({ testId: 'admin-tickets-42' })` runs
- **THEN** a row exists in `tickets.tickets` with
  `title = '[E2E] admin-tickets-42'`, `type = 'bug'`,
  `reporter_email = 'e2e-admin-tickets-admin-tickets-42@example.com'`,
  `is_test_data = true`, and a non-null `external_id` (T-prefixed)
- **AND** the call returns `{ id, externalId, reporterEmail }` with
  `id` matching a UUID and `externalId` matching `^T\d+$`

#### Scenario: cleanupSeedTicket hard-deletes is_test_data rows

- **GIVEN** a ticket row inserted via `seedAdminTicket` with
  `is_test_data = true`
- **WHEN** `cleanupSeedTicket(id)` runs
- **THEN** the row is gone from `tickets.tickets`
- **AND** any `ticket_comments` / `ticket_activity` / `ticket_links`
  linked to that id are gone too (CASCADE)

#### Scenario: cleanupSeedTicket leaves non-test rows untouched

- **GIVEN** a ticket row with `is_test_data = false` (e.g. a real
  reporter ticket)
- **WHEN** `cleanupSeedTicket(id)` runs
- **THEN** the row is NOT deleted
- **AND** no error is raised

### Requirement: Test skip-gate on missing seed infrastructure

The Playwright spec
`tests/e2e/specs/fa-admin-tickets.spec.ts` SHALL call
`test.skip(!seedAvailable(), 'CRON_SECRET oder SESSIONS_DATABASE_URL fehlt — DB-Seed würde Prod-Tracker verschmutzen oder scheitern')`
at the top of any test that performs a DB-level seed, and SHALL
similarly call `test.skip(!ADMIN_PASS, …)` for any test that requires
admin login. The two skips are independent and SHALL both be present.

#### Scenario: Test skips when CRON_SECRET is unset

- **GIVEN** `CRON_SECRET` is unset and `SESSIONS_DATABASE_URL` is set
- **WHEN** the `FA-admin-tickets` describe block runs
- **THEN** every test in it is reported as `skipped`
- **AND** no DB write is attempted
- **AND** no `POST /api/bug-report` is sent

#### Scenario: Test skips when SESSIONS_DATABASE_URL is unset

- **GIVEN** `SESSIONS_DATABASE_URL` is unset and `CRON_SECRET` is set
- **WHEN** the `FA-admin-tickets` describe block runs
- **THEN** every test in it is reported as `skipped`
- **AND** the message is the one from `test.skip(!seedAvailable(), …)`

#### Scenario: Test runs when both env vars are set

- **GIVEN** both `CRON_SECRET` and `SESSIONS_DATABASE_URL` are set
  and the admin password is set
- **WHEN** the `FA-admin-tickets` describe block runs
- **THEN** the `full flow: filter + comment + transition + timeline`
  test attempts a real DB seed + admin flow
- **AND** the seed is followed by `cleanupSeedTicket(ticketUuid)` in a
  `finally` block

### Requirement: try/finally cleanup of seeded tickets

Every test in `tests/e2e/specs/fa-admin-tickets.spec.ts` that calls
`seedAdminTicket` SHALL wrap its body in
`try { … } finally { await cleanupSeedTicket(ticketUuid) }`, so a
failing assertion or an unexpected exception still scrubs the seeded
row. The `cleanupSeedTicket` call SHALL be reached even when an
earlier `expect()` throws.

#### Scenario: cleanup runs after successful flow

- **GIVEN** a full flow test that ends without throwing
- **WHEN** the test body completes
- **THEN** `cleanupSeedTicket(ticketUuid)` is invoked
- **AND** a subsequent `SELECT count(*) FROM tickets.tickets WHERE id = $1`
  returns 0

#### Scenario: cleanup runs after failed assertion

- **GIVEN** a full flow test where the `rowCount` assertion at the
  end of the timeline check fails
- **WHEN** Playwright catches the `expect.toBeGreaterThanOrEqual(4)`
  failure
- **THEN** the `finally` block still runs
- **AND** `cleanupSeedTicket(ticketUuid)` deletes the seeded row
- **AND** the next test in the suite starts with a clean schema

### Requirement: Removal of the runtime self-seed path

The Playwright spec SHALL NOT import `createTestBugReport` or
`markerAvailable` from `tests/e2e/lib/e2e-marker.ts` for its
self-seeding path, and SHALL NOT POST to `/api/bug-report` from
inside a test body. The `e2e-marker.ts` module remains available for
other tests that legitimately need to drive the public API
end-to-end (e.g. `fa-bug-t000368.spec.ts`).

#### Scenario: No reference to createTestBugReport in the spec

- **GIVEN** `tests/e2e/specs/fa-admin-tickets.spec.ts`
- **WHEN** the file is grep'd for `createTestBugReport`
- **THEN** the search returns 0 matches

#### Scenario: No reference to /api/bug-report in the spec

- **GIVEN** `tests/e2e/specs/fa-admin-tickets.spec.ts`
- **WHEN** the file is grep'd for `/api/bug-report`
- **THEN** the search returns 0 matches (other tests that exercise
  the bug-report endpoint keep their usage)
