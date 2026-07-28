## ADDED Requirements

### Requirement: Test-Inventar erfasst jede Shell-Testdatei

The test inventory generator SHALL emit at least one entry for every shell test file it
discovers under `tests/local/`, `tests/prod/` and `tests/spec/`, regardless of whether the file
carries a structured requirement ID.

Files whose requirement reference is expressed through the directory convention introduced by
T002416 (`tests/spec/<ssot-spec-slug>/<short-slug>.bats`) SHALL derive their `category` from the
directory name, so that the entry maps onto the corresponding SSOT spec under `openspec/specs/`.

Files that already yield structured IDs — either from the filename pattern or from uppercase IDs
in their `@test` titles — SHALL keep those entries unchanged. The path-derived fallback applies
only where both existing mechanisms produce nothing.

The emitted JSON schema SHALL remain `{id, file, category, kind}`, so that existing consumers
require no change.

#### Scenario: File under the directory convention is captured

- **GIVEN** the file `tests/spec/openspec-workflow/half-archive-guard.bats`, whose name carries
  no requirement ID and whose `@test` titles contain no uppercase structured ID
- **WHEN** the inventory is regenerated
- **THEN** the inventory contains at least one entry with `file` equal to that path
- **AND** that entry's `category` is `openspec-workflow`

#### Scenario: Legacy top-level file without an ID is captured

- **GIVEN** the file `tests/spec/ci-cd.bats`, which carries no requirement ID in its name
- **WHEN** the inventory is regenerated
- **THEN** the inventory contains at least one entry with `file` equal to that path

#### Scenario: Structured IDs survive the fallback

- **GIVEN** the file `tests/spec/software-factory.bats`, whose `@test` titles carry the
  structured IDs `FA-SF-01` through `FA-SF-74`
- **WHEN** the inventory is regenerated
- **THEN** the inventory still contains exactly 54 entries for that file
- **AND** none of them is a single path-derived entry replacing them

### Requirement: Inventar-Erzeuger bricht bei unerfasster Testdatei ab

The test inventory generator SHALL fail with a non-zero exit status and name the offending paths
when a discovered shell test file produces no entry.

This guard is deliberate regression protection for future changes to the discovery logic. Given
the path-derived fallback above, no file can currently trigger it. It is therefore intentionally
not covered by a test of its own: such a test could only pass vacuously, which is the very defect
class this change removes.

#### Scenario: Every discovered file yields an entry

- **GIVEN** the current test suite
- **WHEN** the inventory is regenerated
- **THEN** the generator exits zero
- **AND** every discovered shell test file appears at least once in the inventory

### Requirement: Ausgabepfad des Inventar-Erzeugers ist umlenkbar

The test inventory generator SHALL write to the path given in the `TEST_INVENTORY_OUT`
environment variable when it is set, and to `website/src/data/test-inventory.json` otherwise.

This exists so that tests can execute the generator and assert on its result without mutating the
committed inventory.

#### Scenario: Generator honours the redirected output path

- **GIVEN** `TEST_INVENTORY_OUT` set to a path outside the repository working tree
- **WHEN** the generator runs
- **THEN** the given path contains the generated inventory
- **AND** `website/src/data/test-inventory.json` is left untouched
