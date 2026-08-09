## ADDED Requirements

### Requirement: Diff-scoped test selection sees uncommitted changes

`scripts/find-changed-tests.sh` SHALL compute its default changed-file list
from a diff basis that includes uncommitted working-tree changes (staged and
unstaged), not only committed drift between `HEAD` and `origin/main`. When
`origin/main` is not resolvable, the script SHALL fall back to a
working-tree diff against `HEAD`.

The script SHALL always emit one line to stderr naming which diff source
produced the changed-file list and how many raw entries it contained,
regardless of whether the resulting test selection is empty. This applies
whether the source is `origin/main`, the `HEAD` fallback, or the
`FIND_CHANGED_TESTS_FILES` override.

#### Scenario: Uncommitted spec file changes are detected

- **GIVEN** a git worktree whose `HEAD` is behind `origin/main` by unrelated
  commits
- **AND** a `tests/spec/**/*.bats` file has an uncommitted (unstaged) edit
- **WHEN** `scripts/find-changed-tests.sh spec` runs
- **THEN** the uncommitted file appears in the script's output as a matched
  candidate

#### Scenario: True "no changes" stays distinguishable from a missed diff

- **GIVEN** a git worktree with no uncommitted changes and no committed
  drift against `origin/main`
- **WHEN** `scripts/find-changed-tests.sh spec` runs
- **THEN** the script exits 0 with empty stdout
- **AND** the stderr provenance line reports 0 raw entries from the
  `origin/main` diff source

#### Scenario: FIND_CHANGED_TESTS_FILES override still short-circuits the diff

- **GIVEN** `FIND_CHANGED_TESTS_FILES` is set to a newline-separated file list
- **WHEN** `scripts/find-changed-tests.sh` runs
- **THEN** the script uses that list verbatim instead of invoking `git diff`
- **AND** the stderr provenance line labels the source as `override`
