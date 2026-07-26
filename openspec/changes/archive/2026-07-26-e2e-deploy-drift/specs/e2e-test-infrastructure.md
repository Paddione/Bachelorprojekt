# e2e-test-infrastructure

## ADDED Requirements

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
