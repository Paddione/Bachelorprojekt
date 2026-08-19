## ADDED Requirements

### Requirement: pr-babysit-ticket bewertet CI gegen den PR-HEAD

`scripts/factory/pr-babysit-ticket.sh` SHALL evaluate the PR's CI state via
the check-runs API of the PR's current `headRefOid`
(`filter=latest`, `failure`/`timed_out` conclusions count as red) instead of
the SHA-less aggregated `gh pr checks` list, and SHALL treat a
`total_count == 0` result on that commit as `ci-never-ran`: an immediate
non-zero exit with a diagnostic message instead of polling. A `gh` failure
during the HEAD evaluation SHALL fall back to the existing empty-list path.

#### Scenario: Vorgänger-SUCCESS maskiert einen leeren PR-HEAD nicht
- **GIVEN** the aggregated check list shows SUCCESS from an earlier commit
- **AND** the check-runs API reports `total_count = 0` for the PR's current
  `headRefOid`
- **WHEN** `pr-babysit-ticket.sh` evaluates the CI state
- **THEN** it SHALL exit non-zero with a `ci-never-ran` diagnostic instead of
  polling in the green branch

#### Scenario: Grüner PR-HEAD bleibt grün
- **GIVEN** the check-runs API reports runs on the PR head and none has
  `conclusion == "failure"` or `"timed_out"`
- **WHEN** `pr-babysit-ticket.sh` evaluates the CI state
- **THEN** it SHALL treat the PR as green (unchanged polling behavior)

#### Scenario: Roter PR-HEAD wird sichtbar
- **GIVEN** the aggregated check list shows SUCCESS from an earlier commit
- **AND** the check-runs API reports a `failure` conclusion on the current
  `headRefOid`
- **WHEN** `pr-babysit-ticket.sh` evaluates the CI state
- **THEN** it SHALL treat the PR as red and run the fix path
