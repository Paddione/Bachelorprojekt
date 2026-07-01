## ADDED Requirements

### Requirement: plan-lint baseline expectations SHALL track baseline.json dynamically

The `tests/unit/plan-lint.bats` B1-math test for a baselined file's effective
threshold SHALL read the expected value from `docs/code-quality/baseline.json`
at test-run time rather than hardcoding a historical snapshot, so the test
cannot silently go stale when a file's baselined line count changes.

#### Scenario: baseline.json metric changes after a cleanup PR

- **GIVEN** `docs/code-quality/baseline.json` records an updated `metric` for
  `S1:website/src/components/inbox/InboxApp.svelte` after the file shrinks
  - **WHEN** `tests/unit/plan-lint.bats` runs the
    `"B1 math: baselined file uses max(limit, baseline.metric)"` test
  - **THEN** the test computes its expected value as
    `max(500, baseline.metric)` read live from `baseline.json`, and passes
    without requiring a manual update to a hardcoded number

### Requirement: mishap-bundle drift tickets SHALL be documented even when deliberately left unfixed

For mishap-bundle tickets that combine a fixable bug with tickets-status
drift, the drift findings SHALL be documented with root-cause analysis in
the change's `mishaps.md`, and a lightweight offline test SHALL assert that
documentation exists — without requiring a live-bug reproduction for drift
that is either already resolved or explicitly deferred to manual review.

#### Scenario: a drift finding is deliberately left unfixed pending manual review

- **GIVEN** a ticket status drift (e.g. `done` without merge evidence) that a
  human has explicitly decided not to auto-correct pending further review
  - **WHEN** the mishap-bundle regression-guard suite runs in CI
  - **THEN** it asserts the drift is documented in `mishaps.md` (via an
    offline, DB-free check) instead of asserting a corrected ticket status,
    so CI does not block on a fix the user explicitly deferred
