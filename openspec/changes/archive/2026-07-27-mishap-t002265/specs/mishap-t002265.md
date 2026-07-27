## ADDED Requirements

### Requirement: residual_budget returns empty for ungated extensions

The `residual_budget` function in `plan-lint.sh` SHALL return empty output for files with ungated extensions and no baseline entry, instead of a negative line count.

#### Scenario: ungated file gets empty residual budget

- **GIVEN** a file with an extension not in `_S1_LIMITS` (e.g. `.bats`)
- **WHEN** `residual_budget` is called for that file
- **THEN** it SHALL return empty output (not a negative number)

### Requirement: CLAUDE.md documents BATS runner path

CLAUDE.md SHALL document the vendored BATS runner path and warn about global npm bats differing from CI.

#### Scenario: agent uses correct BATS runner

- **GIVEN** an agent needs to run a BATS test
- **WHEN** the agent reads CLAUDE.md for the runner path
- **THEN** it SHALL find `tests/unit/lib/bats-core/bin/bats` documented
