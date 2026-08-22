## ADDED Requirements

### Requirement: A unit test never removes itself from CI because a dependency was not installed

No test under `tests/unit/` SHALL call `skip` on the grounds that a package manager
dependency is missing. Every dependency a unit test needs SHALL be installed by the CI job
that runs it, before the suite starts, rather than from within the test itself.

The `test-bats` job in `.github/workflows/ci.yml` SHALL therefore install the
`components/website` dependencies in addition to the repository root ones.

Rationale: a bats `skip` counts as `ok`. A test that skips itself when its dependency is
absent turns a missing installation into a green job, and the gap stays invisible for as
long as nobody reads the log — four runtime tests in `tests/unit/tickets-transition.bats`
skipped on every CI run because `components/website/node_modules` was never installed, and
`tests/unit/test_art_library_manifest.bats` ran `npm install` inside its own `setup_file`
with `|| skip` as a fallback, which turns a registry hiccup into silent coverage loss. The
same failure mode was diagnosed for the cockpit daemon in T002508.

Installing in the job rather than in the test also keeps network access out of the test
phase, where a failure is indistinguishable from an absent feature.

#### Scenario: The BATS job installs the website dependencies

- **GIVEN** `.github/workflows/ci.yml`
- **WHEN** the `test-bats` job definition is read
- **THEN** it sets up pnpm and installs the `components/website` dependencies before the
  BATS suite runs

#### Scenario: No unit test skips itself over a missing dependency

- **GIVEN** every `.bats` file under `tests/unit/`
- **WHEN** their `skip` invocations are examined
- **THEN** none of them gives a missing package manager dependency as the reason
