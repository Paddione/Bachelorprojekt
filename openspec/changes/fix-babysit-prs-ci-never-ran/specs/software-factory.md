## ADDED Requirements

### Requirement: PR-CI-Babysitter meldet PRs, deren CI nie lief

When `babysit-prs.sh` finds no red candidate, it SHALL scan the open
non-draft PRs of the same filter chain whose `statusCheckRollup` has no
`COMPLETED` entry, SHALL read each such PR's `headRefOid` and query the
check-runs API for that commit, and SHALL emit a notify payload
(`event=ci-never-ran`, including the PR number) for every PR whose
`total_count` is 0. PRs whose rollup contains `IN_PROGRESS` checks SHALL NOT
be reported. A `gh` failure during this scan SHALL NOT abort the tick.

#### Scenario: PR ohne Check-Runs wird gemeldet
- **GIVEN** one open non-draft PR whose `statusCheckRollup` is empty
- **AND** the check-runs API reports `total_count = 0` for its `headRefOid`
- **WHEN** `babysit-prs.sh` runs and finds no red candidate
- **THEN** it SHALL emit a notify payload with `event=ci-never-ran` and the
  PR number

#### Scenario: Laufende Checks werden nicht als nie-gelaufen gemeldet
- **GIVEN** one open non-draft PR whose `statusCheckRollup` has an
  `IN_PROGRESS` entry
- **WHEN** `babysit-prs.sh` runs and finds no red candidate
- **THEN** it SHALL NOT emit a `ci-never-ran` payload for that PR

#### Scenario: Check-Runs existieren, aber kein COMPLETED-Eintrag
- **GIVEN** one open non-draft PR with a pending-only rollup
- **AND** the check-runs API reports `total_count > 0` for its `headRefOid`
- **WHEN** `babysit-prs.sh` runs and finds no red candidate
- **THEN** it SHALL NOT emit a `ci-never-ran` payload for that PR
