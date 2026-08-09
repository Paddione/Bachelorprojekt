## ADDED Requirements

### Requirement: REQ-CI-BATS-ENVBRANCH-001 — Tests must not assert on the live checkout's branch

BATS test files SHALL NOT read or assert on the current branch of the live checkout. Branch
assertions SHALL be made against a throwaway repository fixture the test creates and controls
(`git -C "$TMP/…"`), never against the repository the test is running in.

A CI guard SHALL enforce this by scanning every `.bats` file under `tests/` and failing when a
non-comment line reads the live checkout's branch — either explicitly (`git -C "$REPO_ROOT" …`)
or implicitly (a `git rev-parse --abbrev-ref HEAD` / `git branch --show-current` invocation
without `-C`). The guard SHALL exclude its own file, whose detection patterns necessarily
contain the forbidden strings.

#### Scenario: A test making the live checkout's branch a precondition fails the guard

- **GIVEN** a `.bats` file containing `current_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"`
  followed by an assertion on that value
- **WHEN** the CI guard runs
- **THEN** the guard fails and names the offending file and line

#### Scenario: A test asserting on a fixture repository's branch passes the guard

- **GIVEN** a `.bats` file containing `[ "$(git -C "$TMP/repo" rev-parse --abbrev-ref HEAD)" = "main" ]`
- **WHEN** the CI guard runs
- **THEN** the guard passes, because the assertion targets a fixture the test controls

#### Scenario: A comment mentioning the pattern does not trip the guard

- **GIVEN** a `.bats` file whose comment text mentions `rev-parse --abbrev-ref HEAD` without
  invoking it
- **WHEN** the CI guard runs
- **THEN** the guard passes, because comment lines are excluded from the scan

#### Scenario: The guard is not vacuous when no offender exists

- **GIVEN** a repository in which no `.bats` file reads the live checkout's branch
- **WHEN** the CI guard runs
- **THEN** the guard passes only after confirming that it found `.bats` files at all and that it
  found at least one fixture-form branch assertion in a file other than its own

#### Scenario: worktree-create.sh --help succeeds regardless of the current branch

- **GIVEN** a checkout standing on `main`
- **WHEN** `scripts/worktree-create.sh --help` runs
- **THEN** it exits 0, prints no `FATAL` line, and documents the `--unattended` option
