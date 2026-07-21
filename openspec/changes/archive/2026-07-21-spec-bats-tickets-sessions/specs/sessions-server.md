## ADDED Requirements

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/sessions-server.bats`) that establishes
initial, spec-linked test coverage for the sessions-server SSOT spec, per the "one BATS file per
OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/sessions-server.bats` exists
- **WHEN** `bats tests/spec/sessions-server.bats` is run
- **THEN** the placeholder test `sessions-server spec covered` passes
