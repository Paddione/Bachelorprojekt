## ADDED Requirements

### Requirement: Spec-Suite selection for script changes

`scripts/find-changed-tests.sh spec` SHALL resolve a changed `scripts/**` file to the spec
suites that actually assert about it, in this order: first a name-based match against
`tests/spec/<name>.bats` and its known prefixes, then — when no name matches — the path probe
that greps the changed path in `tests/spec/*.bats` and selects the deepest referencing suite.
Widening to the full spec suite (`RUN_ALL`) SHALL remain the fallback, but only after BOTH the
name match and the path probe have found nothing.

`task test:changed` SHALL consult the spec finder for changes under `scripts/**`, so that a spec
suite whose subject lives outside `tests/spec/` is reachable by the selection at all.

#### Scenario: a script change selects the spec suite that references it

- **GIVEN** `scripts/factory/queue.sh` changed, no `tests/spec/queue.bats` or
  `tests/spec/factory-queue.bats` exists, and `tests/spec/software-factory.bats` names the path
- **WHEN** `bash scripts/find-changed-tests.sh spec` runs
- **THEN** the output is exactly `tests/spec/software-factory.bats`, not the full suite listing

#### Scenario: a script change with no referencing spec still widens

- **GIVEN** `scripts/orphan/nobody-tests-me.sh` changed and no spec suite names it or its
  ancestor directories
- **WHEN** `bash scripts/find-changed-tests.sh spec` runs
- **THEN** every non-excluded spec suite is returned, preserving the safety net

#### Scenario: task test:changed reaches the spec suite for a script-only change

- **GIVEN** a diff touching only `scripts/factory/queue.sh`
- **WHEN** `task test:changed` runs
- **THEN** the spec-selection branch executes and runs `tests/spec/software-factory.bats`
