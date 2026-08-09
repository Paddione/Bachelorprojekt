# mishap-rollup

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-rollup ergänzen._

## Requirements

### Requirement: Mishap rollup generates compliant change per run

The mishap rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL produce a plan-only change in
`openspec/changes/mishap-incident-rollup/` that passes OpenSpec validation on every regeneration.

#### Scenario: Change directory passes openspec validation

- **GIVEN** the rollup generator runs with fresh batch comments on the container ticket
- **WHEN** the resulting `openspec/changes/mishap-incident-rollup/` is committed
- **THEN** the OpenSpec validation tests SHALL pass
- **AND** `specs/` SHALL exist with at least one delta file

<!-- merged from change delta mishap-rollup.md (3692c77d378f) -->

### Requirement: rollup-container self-heals on an empty search result

`scripts/ticket.sh rollup-container` SHALL create a new rollup container ticket (Step 2) when its
search for an existing open container (Step 1) returns an empty result set, instead of aborting
under `set -euo pipefail` before reaching the create path.

#### Scenario: Empty search result still reaches the create path

- **GIVEN** no ticket matches `type='chore' AND title='Mishap Rollup — fortlaufende Sammlung' AND
  status IN ('triage','backlog','planning','plan_staged','in_progress')`
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** the command SHALL exit 0, emit the diagnostic
  "kein offener Container, lege neuen an" on stderr, and print the newly created ticket's
  `external_id` on stdout — the search pipeline's `grep -v` returning exit 1 on empty input SHALL
  NOT abort the function under `pipefail`.

<!-- merged from change delta mishap-rollup.md (c474442eaa67) -->