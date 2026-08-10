## MODIFIED Requirements

### Requirement: Mishap rollup generates compliant change per run

The mishap rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL produce a plan-only change in
`openspec/changes/mishap-incident-rollup/` that archives completed changes into the archive tree and
consolidates SSOT specs.

#### Scenario: Rollup change satisfies OpenSpec validation

- **GIVEN** the rollup has run on the container ticket
- **WHEN** OpenSpec validation scans `openspec/changes/`
- **THEN** the change passes validation (has specs/, proposal.md, tasks.md)
