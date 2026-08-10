## ADDED Requirements

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
