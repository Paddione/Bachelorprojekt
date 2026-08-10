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

### Requirement: Rollup branch advances instead of accumulating generator commits

The mishap rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL keep the
rollup branch at exactly one own generator commit above its base. A regeneration
run SHALL replace the generator's previous commit rather than append a new one, so
that repeated runs move the branch tip forward without lengthening the commit chain.

A run whose regenerated plan is byte-identical to the committed state SHALL be a
no-op: it SHALL exit 0 and leave the remote branch tip unchanged.

#### Scenario: Second run moves the tip instead of appending

- **GIVEN** a repository whose rollup branch carries one generator commit that is
  published on the remote
- **WHEN** the generator runs again with changed plan content
- **THEN** the remote branch tip SHALL differ from the previous tip
- **AND** the number of commits between the base and the remote branch tip SHALL
  still be one

#### Scenario: Unchanged content is a no-op

- **GIVEN** a published rollup branch whose plan content equals what the generator
  would produce
- **WHEN** the generator runs again
- **THEN** it SHALL exit 0
- **AND** the remote branch tip SHALL be the same commit as before the run

### Requirement: Generator never rewrites foreign commits

The generator SHALL only replace a commit it demonstrably authored itself — identified
by the generator commit message AND by touching no paths outside
`openspec/changes/mishap-incident-rollup/`. When the branch tip is any other commit,
the generator SHALL append a new commit and SHALL NOT rewrite history.

#### Scenario: A foreign commit on the branch tip is preserved

- **GIVEN** a rollup branch whose tip is a commit that touches a file outside the
  rollup change directory
- **WHEN** the generator runs and publishes a new plan state
- **THEN** the foreign commit SHALL still be reachable from the remote branch tip
- **AND** the generator's own commit SHALL sit on top of it

<!-- merged from change delta mishap-rollup.md (ac9de4f8ab46) -->