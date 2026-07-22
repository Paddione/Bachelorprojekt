## ADDED Requirements

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
