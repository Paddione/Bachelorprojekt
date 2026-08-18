## ADDED Requirements

### Requirement: devflow-ci-watch derives failed checks from the PR head's check-runs

`scripts/devflow-ci-watch.sh` SHALL derive `FAILED_CHECKS` from the GitHub
check-runs API of the PR's current `headRefOid`
(`repos/Paddione/Bachelorprojekt/commits/<headRefOid>/check-runs?filter=latest`)
instead of the `statusCheckRollup`, SHALL count a check as failed only when its
latest run on that commit has `conclusion == "failure"` or
`conclusion == "timed_out"`, and SHALL NOT report "all green" while any such run
exists. `PENDING_COUNT` detection SHALL remain on the `statusCheckRollup`
(`status != "COMPLETED"`).

#### Scenario: A failed check-run on the PR head prevents the green exit

- **GIVEN** `devflow-ci-watch.sh` is called for an OPEN PR whose `headRefOid`
  has at least one check-run with `conclusion == "failure"`
- **AND** all checks report `status == COMPLETED`
- **WHEN** the script evaluates the result
- **THEN** it SHALL NOT exit 0 with "✅ … alle grün"
- **AND** it SHALL list the failed check name in the escalation message and
  exit non-zero when `MAX_CI_ATTEMPTS` is exhausted

#### Scenario: A timed-out check-run on the PR head counts as failed

- **GIVEN** the PR head's latest check-run for one check has
  `conclusion == "timed_out"`
- **WHEN** `devflow-ci-watch.sh` evaluates `FAILED_CHECKS`
- **THEN** that check SHALL be treated as failed

#### Scenario: A green PR head still reports green

- **GIVEN** the PR head has check-runs and none has
  `conclusion == "failure"` or `"timed_out"`, and no check is
  `status != COMPLETED`
- **WHEN** `devflow-ci-watch.sh` evaluates the result
- **THEN** it SHALL report "✅ … CI-Checks, alle grün" and exit 0 (unchanged)

#### Scenario: A cancelled latest run is not a code failure

- **GIVEN** the PR head's latest check-run for one check has
  `conclusion == "cancelled"`
- **WHEN** `devflow-ci-watch.sh` evaluates `FAILED_CHECKS`
- **THEN** that check SHALL NOT count as failed by itself
- **AND** the existing job-level counter-check (T003224) SHALL clear
  `FAILED_CHECKS` when no job of the failed run reports `conclusion == "failure"`
