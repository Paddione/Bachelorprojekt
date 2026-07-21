## ADDED Requirements

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the collabora-integration specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/collabora-integration.bats` file exists
- **WHEN** `bats tests/spec/collabora-integration.bats` runs
- **THEN** the smoke test exits successfully
