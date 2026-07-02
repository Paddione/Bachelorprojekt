# g-fe02-bundle-budget

## Purpose

SSOT spec.

## Requirements

### Requirement: Client-JS bundle size is measured and budgeted

The system SHALL measure the total gzipped size of the website client-JS bundle
(`website/dist/client/**/*.js`) and SHALL enforce a per-release no-net-growth budget
against a committed baseline (`website/bundle-baseline.json`).

#### Scenario: Baseline exists and is committed

- **GIVEN** a built website (`website/dist/client/`)
- **WHEN** the measurement script runs in baseline-write mode (`--update-baseline`)
- **THEN** `website/bundle-baseline.json` is written with the total gzip bytes, file count and a timestamp
- **AND** the file is committed to the repository

#### Scenario: PR keeps the bundle at or below budget

- **GIVEN** a committed baseline and a PR whose built client-JS bundle grows by at most 5 percent
- **WHEN** the CI budget gate runs the measurement script in check mode
- **THEN** the gate prints a warning for any non-zero growth and exits 0 (non-blocking)

#### Scenario: PR exceeds the bundle budget

- **GIVEN** a committed baseline and a PR whose built client-JS bundle grows by more than 5 percent
- **WHEN** the CI budget gate runs the measurement script in check mode with `--fail`
- **THEN** the gate exits non-zero and reports the absolute and percentage growth over the baseline

#### Scenario: Script is reachable from the build system (S4)

- **GIVEN** the new measurement script `scripts/check-bundle-size.mjs`
- **WHEN** the S4 reachability gate scans `scripts/*.mjs` against its reference sources
- **THEN** the script is referenced from `.github/workflows/ci.yml` (and a `Taskfile.yml` task) so it is not flagged as an orphan

<!-- merged from change delta g-fe02-bundle-budget.md on 2026-07-01 -->