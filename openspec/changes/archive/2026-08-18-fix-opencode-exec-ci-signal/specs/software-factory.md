## ADDED Requirements

### Requirement: opencode-exec meldet einen PR-HEAD ohne Check-Runs

After the PR step succeeds, `scripts/factory/opencode-exec.sh` SHALL query the
check-runs API for the PR's `headRefOid` (best-effort) and SHALL, when
`total_count == 0`, print a `ci-never-ran` diagnostic and record a `blocked`
phase event for `pr-ready` instead of `done`. A `gh` failure during this query
SHALL NOT change the exit code or the `done` event.

#### Scenario: PR-HEAD ohne Check-Runs wird gemeldet
- **GIVEN** `ensure_pr` succeeded and the PR's `headRefOid` has
  `total_count = 0`
- **WHEN** `opencode-exec.sh` completes the PR step
- **THEN** it SHALL print a diagnostic containing `ci-never-ran`
- **AND** the pr-ready phase event SHALL be recorded as `blocked`

#### Scenario: PR-HEAD mit Check-Runs bleibt done
- **GIVEN** `ensure_pr` succeeded and the PR's `headRefOid` has
  `total_count > 0`
- **WHEN** `opencode-exec.sh` completes the PR step
- **THEN** it SHALL NOT print a `ci-never-ran` diagnostic
- **AND** the pr-ready phase event SHALL be recorded as `done`

#### Scenario: gh-Ausfall lässt die Kette unbeschadet
- **GIVEN** the `headRefOid` or check-runs call fails
- **WHEN** `opencode-exec.sh` completes the PR step
- **THEN** it SHALL keep the `done` event and exit with the unchanged code
