## MODIFIED Requirements

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/sessions-server.bats`) that establishes
initial, spec-linked test coverage for the sessions-server SSOT spec, per the "one BATS file per
OpenSpec SSOT spec" convention. Behavioral coverage of the `session-hub.sh` subcommands (`register`,
`list`, `deregister`, `reap`, `start-form`, `regen`) SHALL live in per-topic BATS files under
`tests/spec/sessions-server/` (T002416 directory convention) and SHALL verify command output and
registry JSON state — not source-code patterns. The `<!-- bats: … -->` annotations in this spec
SHALL reference these existing files.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/sessions-server.bats` exists
- **WHEN** `bats tests/spec/sessions-server.bats` is run
- **THEN** the placeholder test `sessions-server spec covered` passes

#### Scenario: Behavioural suite exists and passes

- **GIVEN** the per-topic suites exist under `tests/spec/sessions-server/`
- **WHEN** `tests/unit/lib/bats-core/bin/bats -r tests/spec/sessions-server*` is run
- **THEN** all tests pass with exit code 0

#### Scenario: Annotations reference existing files

- **GIVEN** the `<!-- bats: … -->` annotations in this SSOT spec
- **WHEN** each referenced path is resolved against the repository root
- **THEN** every referenced BATS file exists on disk
