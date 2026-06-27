## ADDED Requirements

### Requirement: PR-Gate — LOC-Budget (S6)

The system SHALL reject PRs that increase total source-file LOC by more than `thresholds.fail_pct`
percent above the committed baseline in `docs/code-quality/loc-budget.json`, or that exceed
`thresholds.absolute_cap`, and SHALL emit a non-blocking warning for PRs exceeding
`thresholds.warn_pct`.

#### Scenario: LOC-Gate wird bei jedem PR als Teil von test:code-quality ausgeführt

- **GIVEN** a PR is opened against `main`
- **WHEN** the `offline-tests` CI job runs `task test:code-quality`
- **THEN** `task loc:check` is executed and its exit code determines whether the quality gate passes

#### Scenario: loc-budget.json ist freshness-überwacht

- **GIVEN** `docs/code-quality/loc-budget.json` was not regenerated after a change to `gates.yaml`
- **WHEN** the `offline-tests` CI job runs `task freshness:check`
- **THEN** the step fails with a message indicating `loc-budget.json` is stale

#### Scenario: Baseline wird post-merge regeneriert

- **GIVEN** a PR is merged to `main`
- **WHEN** the `freshness-regen.yml` GitHub Actions workflow runs `task freshness:regenerate`
- **THEN** `task loc:update-baseline` runs, updating `docs/code-quality/loc-budget.json` with the post-merge LOC count

## MODIFIED Requirements

### Requirement: PR-Gate — Offline Tests (bestehend)

_Modification_: `task test:code-quality` now includes `task loc:check` as an additional
quality gate step. The offline-tests job continues to pass when LOC is within the
warn threshold, and fails when LOC exceeds the fail threshold or absolute cap.
