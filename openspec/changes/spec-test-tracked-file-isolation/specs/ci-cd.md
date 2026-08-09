## ADDED Requirements

### Requirement: Spec tests do not mutate tracked files in the working tree

No test under `tests/spec/` SHALL write to a tracked file of the working tree while running. Tests
that need to exercise a script against modified input SHALL place that input in `$BATS_TEST_TMPDIR`
and point the script at it through its documented overrides — for `scripts/mcp-sync.sh` these are
`MCP_REGISTRY` and `MCP_OUT_DIR` (T002487).

This is a hard requirement rather than a style preference because `task test:spec` and
`task test:spec:changed` run bats with `-j $(nproc) --no-parallelize-within-files`: spec files
execute in parallel, so any in-place mutation is visible to every concurrently running file that
reads the same artifact. Restoring the file afterwards does not remove the hazard — it only narrows
the window.

#### Scenario: mcp-sync render test uses a fixture registry

- **GIVEN** the spec test that asserts a `llamacpp` block on an http client makes `mcp-sync.sh render` fail
- **WHEN** the test runs
- **THEN** `docs/agent-guide/registry/mcp.yaml` is not modified at any point during the run
- **AND** the assertion still holds: `mcp-sync.sh render` exits non-zero for that input

#### Scenario: mcp-servers check test uses a fixture

- **GIVEN** the spec test that mutates `scripts/llm/mcp-servers.json` to make `mcp-sync.sh check` fail
- **WHEN** the test runs
- **THEN** `scripts/llm/mcp-servers.json` is not modified at any point during the run

### Requirement: Spec suite guards against in-place mutation of tracked files

`task test:spec` and `task test:spec:changed` SHALL capture a snapshot of path, modification time and
size for every tracked file immediately before invoking bats, and compare it against a second
snapshot taken after the run. When the snapshots differ, the task SHALL fail and print the differing
paths.

The snapshot SHALL compare modification times rather than content, because a test that mutates a
tracked file and restores it leaves the content unchanged while the modification time still records
the write. A content- or `git status`-based check would report success for exactly the failure mode
this guard exists to catch.

A bats run that already failed SHALL keep its own exit code; the guard SHALL NOT mask it.

#### Scenario: Guard fails when a spec test touches a tracked file

- **GIVEN** a spec test that writes to a tracked file and restores its original content afterwards
- **WHEN** `task test:spec` runs
- **THEN** the task exits non-zero
- **AND** the output names the tracked file that was touched

#### Scenario: Guard stays green for a clean suite

- **GIVEN** a spec suite in which no test writes to a tracked file
- **WHEN** `task test:spec` runs
- **THEN** the guard reports no differing paths
- **AND** the task exit code is the bats exit code

#### Scenario: Guard does not mask a failing bats run

- **GIVEN** a spec suite with a genuinely failing test and no tracked-file mutation
- **WHEN** `task test:spec` runs
- **THEN** the task exits non-zero with the bats exit code
