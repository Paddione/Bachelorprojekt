# e2e-test-infrastructure

## ADDED Requirements

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
