## ADDED Requirements

### Requirement: Mishap rollup generates compliant change per run

The mishap rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL produce a plan-only change in
`openspec/changes/mishap-incident-rollup/` that passes OpenSpec validation on every regeneration.

#### Scenario: Change directory passes openspec validation

- **GIVEN** the rollup generator runs with fresh batch comments on the container ticket
- **WHEN** the resulting `openspec/changes/mishap-incident-rollup/` is committed
- **THEN** the OpenSpec validation tests SHALL pass
- **AND** `specs/` SHALL exist with at least one delta file
