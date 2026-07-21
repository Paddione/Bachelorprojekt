## ADDED Requirements

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the livekit-integration specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/livekit-integration.bats` file exists
- **WHEN** `bats tests/spec/livekit-integration.bats` runs
- **THEN** the smoke test exits successfully
