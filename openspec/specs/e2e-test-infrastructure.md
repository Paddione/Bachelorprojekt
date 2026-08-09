# e2e-test-infrastructure

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu e2e-test-infrastructure ergänzen._

## Requirements

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

<!-- merged from change delta e2e-test-infrastructure.md (654be11fb520) -->

### Requirement: e2e-login matches users case-insensitively

The `/api/auth/e2e-login` endpoint SHALL resolve the requested `username`
parameter against Pocket-ID users case-insensitively over both `username`
and `email`, with an exact (case-sensitive) match taking precedence when
multiple users differ only in casing.

#### Scenario: lowercase harness username finds mixed-case Pocket-ID user

- **GIVEN** Pocket-ID contains a user with username `Paddione`
- **WHEN** the e2e harness calls `/api/auth/e2e-login?username=paddione` with a valid token
- **THEN** the endpoint issues a session and responds `302` to `returnTo`

#### Scenario: unknown user still rejected

- **GIVEN** Pocket-ID contains no user matching `nobody` in any casing
- **WHEN** `/api/auth/e2e-login?username=nobody` is called with a valid token
- **THEN** the endpoint responds `404`

### Requirement: health-assertion unit tests are environment-independent

The unit tests in `tests/e2e/lib/health-assertions.test.ts` SHALL pass
regardless of whether `PROD_DOMAIN` is set in the invoking environment,
by explicitly saving, clearing/setting, and restoring `PROD_DOMAIN`
around every test case that depends on dev- or prod-mode behavior.

#### Scenario: unit project green under prod wrapper env

- **GIVEN** the environment exports `PROD_DOMAIN=example.com`
- **WHEN** `npx playwright test --project=unit` runs
- **THEN** all health-assertion unit tests pass

### Requirement: unauthenticated service probes bypass oauth2-proxy only for anchored health and static-asset routes

The oauth2-proxy deployments for brett and docs SHALL exempt only
exactly anchored, data-free routes (health endpoints and static assets)
from authentication via `--skip-auth-routes`; data-bearing or mutating
API routes SHALL remain authenticated, and E2E tests for those routes
SHALL run in an authenticated project context instead.

#### Scenario: brett healthz reachable without login

- **GIVEN** the brett oauth2-proxy is deployed with the healthz exemption
- **WHEN** an unauthenticated client requests `https://brett.<domain>/healthz`
- **THEN** the response is `200` without a redirect to the auth host

#### Scenario: brett data API stays authenticated

- **GIVEN** the brett oauth2-proxy is deployed with the healthz exemption
- **WHEN** an unauthenticated client requests `https://brett.<domain>/api/snapshots`
- **THEN** the response is a redirect to the auth host (or `401`)

<!-- merged from change delta e2e-test-infrastructure.md (7a385ef30a00) -->

### Requirement: The deployed commit is observable

The website SHALL expose the commit SHA it was built from via
`GET /api/health`, as a field named `commit`, alongside the existing `ok`
field. It SHALL additionally expose `builtAt`.

The SHA SHALL be baked into the image at build time (`ARG`/`ENV GIT_SHA` in the
Dockerfile's **runtime** stage, supplied as a `--build-arg` by
`.github/workflows/build-website.yml`), NOT injected at deploy time via a
manifest. The website has three render paths — the Flux OCI artifact (primary),
`task workspace:deploy` (break-glass) and the legacy CI deploy jobs — and a SHA
carried by a manifest would have to be set correctly in all three.

The field SHALL always be present. When the build-arg chain does not supply a
value, `commit` SHALL be the literal string `"unknown"` rather than being
omitted, so that no consumer can read an absent field as `undefined` and treat
the run as drift-free.

Rationale: `build-website.yml` records that this Dockerfile once had no `ARG`
line at all, which silently turned the `--build-arg` values passed to it into
no-ops. The chain has already snapped once.

#### Scenario: Health endpoint reports the built commit

- **GIVEN** a website image built from commit `abc1234`
- **WHEN** `GET /api/health` is called
- **THEN** the response body contains `"ok": true` and `"commit": "abc1234"`

#### Scenario: Missing build-arg yields "unknown", never an absent field

- **GIVEN** an image built without the `GIT_SHA` build-arg
- **WHEN** `GET /api/health` is called
- **THEN** `commit` is present with the value `"unknown"`

### Requirement: Deploy drift is visible during the run

The Playwright `globalSetup` SHALL fetch the deployed commit from
`GET /api/health` for its target host and compare it against the SHA under test
(`GITHUB_SHA` in CI, `git rev-parse HEAD` locally).

On mismatch it SHALL log a warning prefixed `DEPLOY_DRIFT` naming **both** SHAs,
and SHALL NOT abort the run.

Rationale for not aborting: Flux reconciles every 10 minutes, so drift is
frequently transient. Aborting would forfeit an entire nightly run — including
the trend and flake data, which remains valid under drift — because the deploy
was a few minutes behind.

A failure to reach the health endpoint SHALL be treated as `unknown`, not as
absence of drift.

#### Scenario: Drifted run warns and continues

- **GIVEN** the deployed commit differs from the SHA under test
- **WHEN** the suite starts
- **THEN** a `DEPLOY_DRIFT` warning naming both SHAs is logged
- **AND** the run proceeds to execute its tests

### Requirement: Drifted runs cannot open tickets

`POST /api/admin/tests/ingest-e2e` SHALL NOT open failure tickets when the
submitted `testedSha` does not match the handler's own `GIT_SHA`. It SHALL
still persist `test_results`, and SHALL report `ticketsOpened: 0` with
`reason: "deploy-drift"`.

The drift decision SHALL be an exported pure function so it can be tested
directly rather than only through the request handler.

Drift SHALL be assumed — fail closed — when either side is absent, empty or the
literal `"unknown"`. A gate that waves through a missing value provides no
protection at the exact moment protection is needed.

Comparison SHALL be exact after trimming and lowercasing. Prefix matching is
forbidden: it would silently tolerate a truncated SHA.

Closing already-resolved tickets (`closeQaTicketsBySlug`) is unaffected by the
gate — it is harmless under drift.

Rationale: on 2026-07-26 a nightly run filed T002192 against
`/api/poll/:id` returning HTML on 404. The source on `main` set
`Content-Type: application/json` in both 404 branches the whole time; only the
deployed build lagged. The ticket described a bug that never existed in the
repository.

#### Scenario: Mismatched SHA suppresses ticket creation

- **GIVEN** a payload whose `testedSha` differs from the deployed build's `GIT_SHA`
- **WHEN** the ingest endpoint processes it
- **THEN** the response reports `ticketsOpened: 0` and `reason: "deploy-drift"`
- **AND** the `test_results` rows are still written

#### Scenario: Unknown SHA on either side counts as drift

- **GIVEN** either `testedSha` or the handler's `GIT_SHA` is absent, empty or `"unknown"`
- **WHEN** the ingest endpoint processes the payload
- **THEN** no tickets are opened

### Requirement: Setup gates check the variable the called function reads

An automated test SHALL fail when an auth-setup that **calls** `loginViaE2E()`
does not gate on `CRON_SECRET`, or gates that login path on a credential
`loginViaE2E()` does not read.

The invariant SHALL be per-function, not per-file. A file-wide check would not
have caught T002199: `tests/e2e/lib/auth.ts` does reference `E2E_ADMIN_PASS` —
in `getAdminCredentials()`, a different code path from the one the setup calls.

The check SHALL match the call site (`loginViaE2E(`), not the bare identifier.
`brett-mentolder-auth-setup.spec.ts` imports the symbol without ever calling it,
because its oauth2-proxy login is unimplemented and it fixmes unconditionally.

A meta-test SHALL assert that `loginViaE2E()` still reads `CRON_SECRET`, so that
a change of credentials fails loudly at the mapping instead of leaving the gate
test quietly checking the wrong variable.

#### Scenario: Gate on a credential the login path never sends

- **GIVEN** a setup calls `loginViaE2E()` and gates on `E2E_ADMIN_PASS`
- **WHEN** the spec suite runs
- **THEN** the test fails, naming the file and the mismatched variable

#### Scenario: Imported but never called is not flagged

- **GIVEN** a setup imports `loginViaE2E` without calling it and fixmes unconditionally
- **WHEN** the spec suite runs
- **THEN** the test does not flag that file

#### Scenario: Mapping drift fails the meta-test first

- **GIVEN** `loginViaE2E()` stops reading `CRON_SECRET`
- **WHEN** the spec suite runs
- **THEN** the meta-test guarding the mapping fails

<!-- merged from change delta e2e-test-infrastructure.md (b49a5331b62a) -->

### Requirement: Fail-closed website admin auth setup

The Playwright auth-setup projects that establish a website admin session
(`mentolder-setup`, `korczewski-setup`) SHALL fail hard when the credential
their login actually needs is absent. They SHALL NOT degrade to an empty
`storageState` while reporting success.

The required credential is `CRON_SECRET`, because `loginViaE2E()`
(`tests/e2e/lib/auth.ts`) authenticates via
`GET /api/auth/e2e-login?username=…&token=$CRON_SECRET`. The admin password
(`E2E_ADMIN_PASS` / `TEST_ADMIN_PASSWORD`) is never sent by this login path and
SHALL NOT be used as the gate.

Rationale: on 2026-07-26 a run gated on `E2E_ADMIN_PASS` while `CRON_SECRET` was
present. The setup wrote `{"cookies":[],"origins":[]}`, finished green, and the
dependent `mentolder` project executed ~33 admin tests without a session. Every
one failed on a 45-second locator timeout, and four of those cascades were filed
as product bugs (T002189, T002190, T002191, T002197).

#### Scenario: Missing CRON_SECRET fails the setup instead of degrading

- **GIVEN** `CRON_SECRET` is unset or empty
- **WHEN** the `mentolder-setup` or `korczewski-setup` project runs
- **THEN** the setup test throws an error naming `CRON_SECRET`
- **AND** no `.auth/*-website-admin.json` file with an empty `cookies` array is
  written by the admin path
- **AND** Playwright skips the dependent project rather than running it
  unauthenticated

#### Scenario: Present CRON_SECRET yields a populated storage state

- **GIVEN** `CRON_SECRET` is set to the value the website accepts
- **WHEN** the `mentolder-setup` project runs
- **THEN** `/api/auth/me` reports `authenticated: true`
- **AND** `.auth/mentolder-website-admin.json` contains at least one cookie

#### Scenario: storageState writes are awaited

- **GIVEN** the admin login succeeded
- **WHEN** the setup persists the session
- **THEN** every `page.context().storageState({ path })` call is awaited before
  the test returns, so the write cannot race the browser context teardown

### Requirement: Brett auth setups are explicitly unsupported, not silently empty

The brett auth-setup paths (`brett-mentolder-setup`, and the brett half of
`korczewski-setup`) cannot log in yet: oauth2-proxy against Pocket ID requires
the passkey / one-time-code flow (T003163). These setups SHALL mark themselves
`testInfo.fixme(true, …)` unconditionally rather than returning early on a
missing credential.

A bare early return leaves the setup green and lets the dependent brett project
run without a session; `fixme` records the unsupported state visibly.

#### Scenario: Brett setup reports fixme regardless of credentials

- **GIVEN** any combination of credential environment variables
- **WHEN** a brett auth-setup test runs
- **THEN** it marks itself fixme with a reason referencing the Pocket ID
  passkey flow
- **AND** it does not read `process.env.E2E_ADMIN_PASS` in any code path

### Requirement: Admin-gated specs run in an authenticated project

Any Playwright spec that navigates to an `/admin` route SHALL be listed in a
project that declares both `dependencies` on an auth-setup project and a
`storageState`. It SHALL NOT be listed in the `website` or `services` projects,
which are unauthenticated by design.

#### Scenario: fa-51 sidekick spec is authenticated

- **GIVEN** `tests/e2e/playwright.config.ts`
- **WHEN** the project definitions are inspected
- **THEN** `**/fa-51-*.spec.ts` appears in the `mentolder` project's `testMatch`
- **AND** it does not appear in the `website` project's `testMatch`

<!-- merged from change delta e2e-test-infrastructure.md (a23425090782) -->

### Requirement: Agentic headed Playwright run (REQ-k8-01)

A headed Playwright stage MUST exercise the live deployed application in a real
browser, so defects that only surface after rendering are caught.

#### Scenario: Headed run against the deployed application

- **GIVEN** an implementation has been deployed to the fleet cluster
- **WHEN** the agent starts a headed test run
- **THEN** the live application is exercised in a real Chrome browser

### Requirement: Not a merge gate (REQ-k8-02)

The headed stage MUST stay out of the required CI path, because it depends on a
live deployment and would otherwise block merges on environment availability.

#### Scenario: PR merge is unaffected by the headed stage

- **GIVEN** the K8 headed test exists
- **WHEN** a pull request is opened or merged
- **THEN** the K8 test is NOT executed as a merge gate

### Requirement: Integration into the dev-flow-e2e skill (REQ-k8-03)

The `dev-flow-e2e` skill MUST be able to invoke the headed stage as an optional
step after implementation is complete.

#### Scenario: Skill offers the headed stage

- **GIVEN** the `dev-flow-e2e` skill is invoked
- **WHEN** the implementation step is complete
- **THEN** the skill can run the K8 headed test as an optional stage

### Requirement: Optional vision-assisted verification (REQ-k8-04)

Where visual elements must be judged, the agent MAY delegate screenshots to the
mmproj vision server rather than asserting on the DOM alone.

#### Scenario: Screenshot is validated by the vision server

- **GIVEN** the mmproj vision server is running on port 8094
- **WHEN** the agent needs to verify a visual element
- **THEN** it can send a screenshot to the vision server and validate the answer

<!-- merged from change delta e2e-test-infrastructure.md (8c9b63ca7283) -->

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

<!-- merged from change delta e2e-test-infrastructure.md (5c9e36cab84c) -->