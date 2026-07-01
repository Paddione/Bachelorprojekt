## ADDED Requirements

### Requirement: G-SIZE04 LOC/week measurement excludes plan artefacts

The system SHALL exclude `openspec/changes/**` from the G-SIZE04 LOC/week scan
so that plan artefacts (proposal.md, tasks.md, design-sync scaffolding) do not
inflate the measured weekly code growth.

#### Scenario: openspec/changes excluded from LOC scan

- **GIVEN** the `scripts/check-loc-budget.mjs` script
- **WHEN** the scan universe is built
- **THEN** files under `openspec/changes/` are excluded from the measurement

### Requirement: G-SIZE04 warn-pct tightened to 2 %

The system SHALL use `warn_pct: 2` (was 5) for the S6 LOC-budget gate so that
a LOC growth of more than 2 % triggers a warning before the 15 % fail threshold.

#### Scenario: warn-pct is 2 or lower

- **GIVEN** `scripts/check-loc-budget.mjs` and `docs/code-quality/loc-budget.json`
- **WHEN** the gate is evaluated
- **THEN** the effective warn-pct threshold is ≤ 2 %
