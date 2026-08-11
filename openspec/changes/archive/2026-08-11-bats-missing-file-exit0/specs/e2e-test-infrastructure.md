## ADDED Requirements

### Requirement: BATS-Lauf bricht bei nicht existierendem Testpfad mit Exit != 0 ab

The system SHALL provide a central bats runner wrapper (proposed path
`scripts/lib/run-bats.sh`) that verifies the existence of every explicitly
named `.bats` file or directory before delegating to the vendored bats binary,
and SHALL exit non-zero when any named path does not exist.

Rationale: the vendored bats binary reports a missing file on stdout but
exits 0 (`ERROR: Test file "…" does not exist.` followed by `exit=0`). Any
caller that evaluates only the exit code sees green for a verification step
that never ran — silently dropping renamed or relocated test files from every
named invocation (Taskfile targets, CI steps, `scripts/find-changed-tests.sh`
consumers, runbooks, agent instructions).

#### Scenario: missing test file aborts the run

- **GIVEN** a caller invokes the wrapper with a path to a `.bats` file that does not exist
- **WHEN** the wrapper runs
- **THEN** it prints an error naming the missing path and exits with a non-zero status

#### Scenario: existing test path passes through to bats

- **GIVEN** a caller invokes the wrapper with a path to an existing `.bats` file
- **WHEN** the wrapper runs
- **THEN** it delegates to the vendored bats binary and propagates its exit status

#### Scenario: missing directory also aborts

- **GIVEN** a caller invokes the wrapper with a directory path that does not exist
- **WHEN** the wrapper runs
- **THEN** it exits with a non-zero status (mirroring the vendored binary's correct directory behavior)
