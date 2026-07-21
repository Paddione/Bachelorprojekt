## ADDED Requirements

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/active-sessions-hub.bats`) that
establishes initial, spec-linked test coverage for the active-sessions-hub SSOT spec, per the
"one BATS file per OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/active-sessions-hub.bats` exists
- **WHEN** `bats tests/spec/active-sessions-hub.bats` is run
- **THEN** the placeholder test `active-sessions-hub spec covered` passes
