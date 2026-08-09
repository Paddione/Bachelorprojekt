## ADDED Requirements

### Requirement: task-context.bats reaps orphaned tcc-fixture-* directories on setup

`tests/spec/dev-flow-plan/task-context.bats` MUST NOT rely solely on its own `teardown()` to
remove the `openspec/changes/tcc-fixture-$$` fixture directory it materializes per run. Its
`setup()` MUST additionally remove any **other** `openspec/changes/tcc-fixture-*` directory that
is older than 10 minutes, before creating the current run's fixture. This makes cleanup
independent of the fixture-creating process surviving to run its own `teardown()` — an aborted
run (WSL crash, session kill, systemd timeout) must not leave a 0-byte fixture leftover in the
tracked working tree that a later `git status` or the freshness regeneration picks up as
untracked garbage. Directories younger than the threshold (i.e. a genuinely concurrent run) MUST
be left untouched, and the reap MUST use the same path-scoped guard as `teardown()`
(`*/openspec/changes/tcc-fixture-*`) so it can never remove an unrelated directory under
`openspec/changes/`.

#### Scenario: orphaned tcc-fixture-* directory from a prior aborted run is removed on setup

- **GIVEN** an `openspec/changes/tcc-fixture-<stale-pid>/` directory exists with an mtime older
  than 10 minutes (simulating a run that died between `mkdir` and `teardown()`)
- **WHEN** `setup()` of `tests/spec/dev-flow-plan/task-context.bats` runs (triggered by executing
  any test in that file)
- **THEN** the stale `openspec/changes/tcc-fixture-<stale-pid>/` directory no longer exists on
  disk after the test run completes

#### Scenario: unrelated openspec/changes/ directory is left untouched

- **GIVEN** an `openspec/changes/<unrelated-slug>/` directory exists that does NOT match the
  `tcc-fixture-*` naming pattern, containing a marker file
- **WHEN** `setup()` of `tests/spec/dev-flow-plan/task-context.bats` runs
- **THEN** the unrelated directory and its marker file still exist unchanged after the test run
