## ADDED Requirements

### Requirement: PR-Gate — Full tests/spec/*.bats Suite is Required, Not a Subset

The system SHALL run the entire `tests/spec/*.bats` glob (all files, not an
enumerated subset) inside the `test-factory` job, which is already a
required status check (`Factory + OpenSpec + Guards`) on `main`. A regression
that silently narrows the invocation back to a hand-picked list of files
SHALL be caught by a BATS assertion before merge.

#### Scenario: CI invokes the full spec glob, not a hardcoded file list

- **GIVEN** `.github/workflows/ci.yml` defines the `test-factory` job
- **WHEN** the guard assertion inspects the job's steps
- **THEN** it finds an invocation that resolves to every file under
  `tests/spec/*.bats` (e.g. via `task test:spec` or an equivalent glob) and
  fails if the invocation only lists specific `.bats` filenames

#### Scenario: A regression in a previously-ungated spec file now blocks merge

- **GIVEN** a PR introduces a regression in any `tests/spec/*.bats` file that
  was not one of the four previously cherry-picked files
  (`software-factory.bats`, `agent-library.bats`, `mcp-tooling.bats`,
  `ci-cd.bats`)
- **WHEN** the `test-factory` job runs
- **THEN** the job fails and blocks auto-merge, because the file is now part
  of the executed glob

#### Scenario: mcp-task-runner binary is available on a fresh CI runner

- **GIVEN** `tests/spec/mcp-task-runner.bats` requires the compiled
  `/usr/local/bin/mcp-task-runner` binary and has no skip-guard for its
  absence
- **WHEN** the `test-factory` job runs on a fresh GitHub Actions runner with
  no pre-installed binary
- **THEN** a Go toolchain is available in the job so `task
  test:spec:build-mcp-runner` can build and install the binary before the
  spec suite runs
