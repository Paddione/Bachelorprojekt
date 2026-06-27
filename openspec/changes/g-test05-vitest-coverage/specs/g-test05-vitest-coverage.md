## ADDED Requirements

### Requirement: Vitest line coverage is measured for website/src/lib

The Vitest configuration SHALL collect V8 line-coverage scoped to
`website/src/lib/**` (excluding test files, `__tests__` helpers, and generated
artifacts) and emit a machine-readable `json-summary` report at
`website/coverage/coverage-summary.json`.

#### Scenario: Coverage report is produced on demand

- **GIVEN** the website workspace with `@vitest/coverage-v8` installed
- **WHEN** a developer runs `pnpm exec vitest run --coverage`
- **THEN** Vitest writes `coverage/coverage-summary.json` containing a
  `total.lines.pct` figure for the `src/lib` scope
- **AND** the run reports the aggregate line-coverage percentage across the
  `node` and `components` projects.

### Requirement: Line coverage of website/src/lib is at least 60 percent

The website test suite SHALL keep line coverage of `website/src/lib` at or above
60 percent. A coverage run below the threshold SHALL exit non-zero.

#### Scenario: Coverage below threshold fails

- **GIVEN** line coverage of `website/src/lib` is below 60 percent
- **WHEN** `pnpm exec vitest run --coverage` runs with `thresholds.lines: 60`
- **THEN** Vitest exits with a non-zero status and names the unmet line threshold.

#### Scenario: Coverage at or above threshold passes

- **GIVEN** line coverage of `website/src/lib` is 60 percent or higher
- **WHEN** `pnpm exec vitest run --coverage` runs
- **THEN** Vitest exits zero and the reported `total.lines.pct` is at least 60.

### Requirement: CI enforces the line-coverage gate

The `Vitest (website)` job in `.github/workflows/ci.yml` SHALL fail the pull
request when line coverage of `website/src/lib` drops below 60 percent.

#### Scenario: CI blocks a coverage regression

- **GIVEN** a pull request whose changes drop `website/src/lib` line coverage
  below 60 percent
- **WHEN** the `Vitest (website)` CI job runs `vitest run --coverage` and parses
  `coverage/coverage-summary.json`
- **THEN** the job exits non-zero and the required check fails, blocking
  auto-merge.
