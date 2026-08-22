## ADDED Requirements

### Requirement: REQ-E2E-INFRA-030 — A skip modifier applies to the test it names, never to its enclosing group

A Playwright skip or fixme modifier placed directly in a `test.describe` body applies to every
test in that group. A modifier intended to document a single non-automatable sub-test SHALL be
attached to that sub-test's own `test()` call. No spec file under `tests/e2e/specs/` SHALL carry
`test.skip(true, …)` or `test.fixme(true, …)` as a direct statement of a `describe` body.

Where the documented sub-test has no corresponding `test()`, the modifier SHALL be removed
without replacement — a modifier that names no test marks nothing and only disables its
neighbours.

This is enforced, not merely documented: a group-level modifier disables its whole file silently,
reporting `time=0` and an empty skip message, which is indistinguishable in the JUnit report from
a legitimate environment gate.

#### Scenario: A group-level modifier fails the guard

- **GIVEN** a spec file under `tests/e2e/specs/` containing a line matching
  `^  test\.(skip|fixme)\(true` at `describe`-body indentation
- **WHEN** the e2e-test-infrastructure BATS guard runs
- **THEN** the guard exits non-zero
- **AND** the failure names the file and line

#### Scenario: A per-test modifier passes the guard

- **GIVEN** a spec file in which a non-automatable sub-test carries its own
  `test.fixme('T4: …', …)` or calls `test.fixme(true, …)` inside its test body
- **WHEN** the guard runs
- **THEN** the guard exits zero
- **AND** the remaining tests of that file are reported as executed, not skipped

### Requirement: REQ-E2E-INFRA-031 — E2E specs assert against the running application, not the repository

Specs under `tests/e2e/specs/` SHALL assert observable behaviour of a deployed target. They SHALL
NOT assert the presence or content of repository files. Repository structure is covered by the
offline test suite (`task test:all`).

No spec file SHALL derive a repository root from its own location. The pattern
`path.resolve(__dirname, '../../../../')` resolves one level *above* the repository root and every
assertion built on it is false by construction.

#### Scenario: A repo-root derivation fails the guard

- **GIVEN** a spec file containing `path.resolve(__dirname, '../../../../')`
- **WHEN** the e2e-test-infrastructure BATS guard runs
- **THEN** the guard exits non-zero

#### Scenario: The offline suite still covers repository structure

- **GIVEN** the E2E repo-file assertions have been removed
- **WHEN** `task test:all` runs
- **THEN** the kustomize structure checks still assert the presence of `k3d/` and the brand
  overlays
- **AND** no coverage of repository structure is lost by the removal

### Requirement: REQ-E2E-INFRA-032 — A guard that always fires belongs outside the nightly run

A spec whose environment gate can never pass against the nightly target SHALL NOT be registered in
a nightly Playwright project. Such specs SHALL be registered in `playwright.local.config.ts` for
optional local execution instead.

This covers the specs gated by `tests/e2e/lib/sdlc-guard.ts` — the `/sdlc/*` routes are removed
from the production build by design, so the gate skips on every nightly run — and the specs gated
on `LLM_ROUTER_URL` / `LLM_HOST_IP`, whose target sits on the GPU host inside `wg-mesh` and is not
reachable from a GitHub-hosted runner.

Outside the nightly context the guard SHALL fail rather than skip: a local run against an instance
that is expected to serve `/sdlc/*` and does not is a defect, not an absent precondition.

#### Scenario: SDLC specs are absent from the nightly projects

- **GIVEN** `tests/e2e/playwright.config.ts`
- **WHEN** its project `testMatch` entries are resolved
- **THEN** no spec importing `guardSdlc` is matched by a project the nightly workflow selects

#### Scenario: A local run against a missing SDLC route fails loudly

- **GIVEN** a local run configured to target an instance serving `/sdlc/*`
- **WHEN** the route returns 404
- **THEN** the run reports a failure naming the unreachable route
- **AND** does not report the affected tests as skipped

### Requirement: REQ-E2E-INFRA-033 — Every authentication domain of the nightly run has its credential supplied

The nightly matrix job SHALL be supplied with the credential of every authentication domain whose
specs it selects. Three domains exist and are distinct:

- `CRON_SECRET` — the website backend, via the `X-Cron-Secret` header and as the token for
  `e2e-login`.
- `FLEET_KUBECONFIG` — everything behind `oauth2-proxy` (Brett, Nextcloud), via
  `kubectl exec … pocket-id one-time-access-token`, as implemented in `tests/e2e/lib/oidc.ts`.
- No credential — the LLM router, which is a network-reachability precondition rather than an
  authentication one and is therefore out of scope for the nightly run (REQ-E2E-INFRA-032).

A service secret SHALL NOT be substituted for a user session where the specs assert
role-dependent behaviour: `CRON_SECRET` carries neither identity nor OIDC claims, and the Brett
specs assert `leiter` / `beobachter` / `isAdmin` enforcement.

When a credential is absent the affected setup SHALL continue to fail closed, as established by
the existing brett-auth-setup requirement — an absent credential degrades visibly, never into a
green run.

#### Scenario: The matrix job can mint an OIDC session

- **GIVEN** the nightly matrix job with `FLEET_KUBECONFIG` present in the repository secrets
- **WHEN** `brett-mentolder-setup` runs
- **THEN** `oidcLoginAvailable()` returns true
- **AND** the dependent `brett-mentolder` project executes its tests instead of skipping them

#### Scenario: An absent kubeconfig still fails closed

- **GIVEN** the nightly matrix job with `FLEET_KUBECONFIG` unset
- **WHEN** `brett-mentolder-setup` runs
- **THEN** it marks itself fixme with the reason naming the missing mechanism
- **AND** the dependent project is skipped rather than run without a session
