## ADDED Requirements

### Requirement: Corrective prefix suggestion for non-conforming type prefixes

When `scripts/worktree-create.sh` rejects a branch name whose type prefix is a Conventional-Commit
ticket type outside the four allowed branch prefixes, it SHALL print a corrected invocation that
maps that ticket type onto a conforming branch prefix, instead of only stating that the prefix is
invalid.

The mapping SHALL be `refactor`, `perf`, `test`, `ci` and `build` onto `chore`; `feat` and
`project` onto `feature`; and `bug` onto `fix`. The set of allowed branch prefixes SHALL remain
unchanged at `feature/`, `fix/`, `chore/` and `docs/`, because the same set is mirrored in
`.githooks/pre-commit` and — in a narrower three-prefix form — in the Software Factory hard guard,
so that widening it in one place alone would move the rejection downstream rather than remove it.

The guard SHALL NOT rewrite the branch name and proceed. It SHALL keep exiting non-zero without
creating a worktree, because the caller reuses the branch name it passed in for the later commit,
push and pull request, and a silently substituted name would not match.

The mapping SHALL live in `scripts/lib/branch-allowlist.sh` and SHALL be sourced conditionally. If
that file is absent, the guard SHALL omit the suggestion and otherwise behave exactly as before, so
that a missing library can never admit a branch name that would previously have been rejected.

#### Scenario: A refactor branch is rejected with a chore suggestion

- **GIVEN** the branch name `refactor/sdlc-routes-remove-T002627`
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits non-zero, creates no worktree, and its output contains
  `chore/sdlc-routes-remove-T002627`

#### Scenario: A conforming branch is still created

- **GIVEN** the branch name `chore/sdlc-routes-remove-T002627`
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits zero and the worktree is created

#### Scenario: The mapping does not widen the allowlist

- **GIVEN** the branch name `refactor/sdlc-routes-remove-T002627`
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** no worktree directory exists at the requested path afterwards

#### Scenario: A perf prefix maps onto chore as well

- **GIVEN** the branch name `perf/query-batching-T002811`
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits non-zero and its output contains `chore/query-batching-T002811`

#### Scenario: An unmapped invalid prefix keeps the plain rejection

- **GIVEN** the branch name `wip/something-T002811`, whose prefix is not a known ticket type
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits non-zero and prints no corrected invocation for the prefix
