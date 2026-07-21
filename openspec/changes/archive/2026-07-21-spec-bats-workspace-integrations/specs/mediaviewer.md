## ADDED Requirements

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the mediaviewer specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/mediaviewer.bats` file exists
- **WHEN** `bats tests/spec/mediaviewer.bats` runs
- **THEN** the smoke test exits successfully
