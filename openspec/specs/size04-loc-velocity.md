# size04-loc-velocity

## Purpose

CI gate that tracks lines-of-code growth velocity and warns when a PR introduces
more than a configurable threshold of new LOC per commit.

## Requirements

### Requirement: LOC Velocity Warning Threshold

The CI gate SHALL warn (non-blocking) when a PR introduces more than the configured
`warn_pct` increase in total LOC compared to the committed `loc-budget.json` baseline.

#### Scenario: PR within budget passes silently

- **GIVEN** a PR increases total LOC by less than `warn_pct` percent
- **WHEN** the CI LOC gate runs
- **THEN** the gate exits 0 with no warning output

#### Scenario: PR exceeding warn threshold emits advisory

- **GIVEN** a PR increases total LOC by more than `warn_pct` percent
- **WHEN** the CI LOC gate runs
- **THEN** the gate exits 0 but logs a warning message indicating the delta
