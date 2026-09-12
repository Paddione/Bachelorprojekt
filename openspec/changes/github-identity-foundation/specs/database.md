## ADDED Requirements

### Requirement: GitHub identity foundation schema is additive and idempotent

The database SHALL add normalized tables for immutable GitHub objects,
repository/number coordinate history, ticket-to-work-item bindings, and directed
GitHub-object relationships. Re-running schema initialization SHALL not duplicate
rows, relax uniqueness, or alter existing ticket behavior.

#### Scenario: Schema initialization is replayed

- **GIVEN** the GitHub identity tables, constraints, indexes, and triggers already exist
- **WHEN** ticket schema initialization runs again
- **THEN** it completes successfully
- **AND** all existing GitHub identity rows remain unchanged

#### Scenario: Additive deployment precedes import

- **GIVEN** production still contains legacy tickets with `T######` external IDs
- **WHEN** the GitHub identity foundation schema is deployed
- **THEN** existing ticket reads and writes retain their current behavior
- **AND** no legacy ticket is deleted or automatically rebound

### Requirement: GitHub identity uniqueness fails closed

The database SHALL enforce uniqueness of GitHub object node IDs, provider-native
advisory references, and current repository-number coordinates, and SHALL allow
at most one current canonical work-item binding per ticket UUID. Provider-native
references SHALL be required for advisory objects and optional for numbered
Issue and Pull Request objects.

#### Scenario: Duplicate object node ID is rejected

- **GIVEN** a GitHub object node ID is already registered
- **WHEN** another object row is inserted with that node ID
- **THEN** the insert fails without replacing the existing object

#### Scenario: Coordinate history retains one current row

- **GIVEN** an object has a current coordinate
- **WHEN** a new current coordinate is recorded transactionally
- **THEN** the old coordinate receives a validity end timestamp
- **AND** the new coordinate is the only current coordinate for that object
