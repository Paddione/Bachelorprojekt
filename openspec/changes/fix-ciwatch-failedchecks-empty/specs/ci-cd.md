## ADDED Requirements

### Requirement: devflow-ci-watch treats an empty failed-checks result as no failure

`scripts/devflow-ci-watch.sh` SHALL treat the empty-array literal `[]` produced
by its failed-checks query (check-runs API, wrapper form) as "no failed
checks", SHALL NOT run the job-level counter-check (T003224) for it, and SHALL
NOT escalate to a red exit while the failed-checks result contains no actual
check entry. The escalation message SHALL list one failed check per line
instead of a JSON array literal.

#### Scenario: Empty failed-checks array with a stale failure run stays green

- **GIVEN** the PR head's failed-checks query returns `[]` (zero failures)
- **AND** a stale failure run for the same head exists whose jobs report
  `conclusion == "failure"`
- **WHEN** `devflow-ci-watch.sh` evaluates the result
- **THEN** it SHALL report "✅ … alle grün" and exit 0
- **AND** it SHALL NOT treat the stale run as a code failure

#### Scenario: Non-empty failed-checks array still escalates

- **GIVEN** the PR head's failed-checks query returns an array with at least
  one entry
- **WHEN** `devflow-ci-watch.sh` evaluates the result
- **THEN** it SHALL keep the existing red path: counter-check via run/job
  level, escalation message listing the failed checks, and exit non-zero when
  `MAX_CI_ATTEMPTS` is exhausted

#### Scenario: Escalation message lists one check per line

- **GIVEN** `FAILED_CHECKS` contains two failed checks
- **WHEN** `devflow-ci-watch.sh` prints the escalation message
- **THEN** each failed check SHALL appear on its own line
- **AND** no JSON array wrapper (`[ … ]`) SHALL be printed
