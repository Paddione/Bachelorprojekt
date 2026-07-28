## ADDED Requirements

### Requirement: The Software Factory BATS suite has a single source

The Software Factory regression cases SHALL live in exactly one file, `tests/spec/software-factory.bats`. The `tests/local/FA-SF-*.bats` tree from which that file was aggregated SHALL NOT be retained alongside it, and `task test:factory` SHALL run the consolidated file rather than the aggregated originals.

Rationale: the consolidation never removed its 41 source files, so every case existed twice under the same `@test` name. That duplication actively hid a defect — after `scripts/factory/pipeline.js` was deleted, a filtered run over `tests/spec/` looked green while `task test:factory` went red over the stale copies, and each follow-up pull request in the factory area had to identify the breakage as foreign before it could proceed.

#### Scenario: No aggregated duplicate of the consolidated suite remains

- **GIVEN** the consolidated suite `tests/spec/software-factory.bats`
- **WHEN** the test tree is inspected
- **THEN** no `tests/local/FA-SF-*.bats` file exists

#### Scenario: The factory task runs the consolidated suite

- **GIVEN** `task test:factory`
- **WHEN** it runs
- **THEN** it executes `tests/spec/software-factory.bats`
- **AND** it does not reference a `tests/local/FA-SF-*` glob that matches nothing

#### Scenario: Removal preserved every case

- **GIVEN** the cases that existed only in the removed files
- **WHEN** the consolidated suite runs
- **THEN** those cases are present in it, so no coverage was lost with the removal
