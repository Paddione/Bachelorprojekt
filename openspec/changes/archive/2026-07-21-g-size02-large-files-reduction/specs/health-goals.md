## ADDED Requirements

### Requirement: Maximum file size cap for VideoVault

The system SHALL enforce that VideoVault source files outside gate scope do not exceed 600 lines for more than 8 files.

#### Scenario: Verify VideoVault file size limit

- **GIVEN** the VideoVault codebase and tests/spec/g-size02-large-files.bats
- **WHEN** BATS runs the file size verification test
- **THEN** the number of files exceeding 600 lines MUST be less than or equal to 8.
