## ADDED Requirements

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the nextcloud-integration specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/nextcloud-integration.bats` file exists
- **WHEN** `bats tests/spec/nextcloud-integration.bats` runs
- **THEN** the smoke test exits successfully
