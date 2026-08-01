# divergence-guard

## Purpose

Erkennt und meldet Abweichungen zwischen deklariertem Soll-Zustand und Ist-Zustand im Repository.

## Requirements

### Requirement: Divergence check before worktree creation
The system SHALL verify that local `main` has `origin/main` as an ancestor before creating a new worktree.

#### Scenario: Local main is in sync
- **GIVEN** local `main` has `origin/main` as an ancestor
- **WHEN** `scripts/worktree-create.sh` runs
- **THEN** it proceeds without divergence warning

#### Scenario: Local main has diverged
- **GIVEN** local `main` has no common ancestor with `origin/main`
- **WHEN** `scripts/worktree-create.sh` runs
- **THEN** it SHALL print a clear error message and exit non-zero
- **AND** the error message SHALL include the recovery command `git reset --hard origin/main`

<!-- merged from change delta divergence-guard.md on 2026-06-28 -->

### Requirement: Post-push sync guard for main
The system SHALL, after a successful push whose current branch is `main`, re-fetch `origin/main` and reconcile any resulting divergence: a content-equivalent divergence MAY be auto-reset, while a genuine divergence SHALL only be warned about and never auto-discarded.

#### Scenario: Content-equivalent divergence auto-resets
- **GIVEN** local `main` has diverged from `origin/main` after a push (neither ref is an ancestor of the other)
- **AND** the two-dot tree diff `git diff origin/main..HEAD` is empty (its `git patch-id` is empty — the local commit's content is already contained upstream, e.g. via squash-merge)
- **AND** the working tree is clean (`git status --porcelain` is empty)
- **WHEN** `scripts/git-safe-push.sh` runs after the push
- **THEN** it SHALL run `git reset --hard origin/main` and log which local ref was discarded

#### Scenario: Genuine divergence warns only
- **GIVEN** local `main` has diverged from `origin/main` after a push
- **AND** the two-dot tree diff is non-empty (the local commit carries unique content) OR the working tree is dirty
- **WHEN** `scripts/git-safe-push.sh` runs after the push
- **THEN** it SHALL NOT run `git reset --hard` and SHALL print the recovery guidance including `git log --oneline origin/main..HEAD`

#### Scenario: Post-push fetch failure does not undo the push
- **GIVEN** a push to `main` has already succeeded
- **WHEN** the follow-up `git fetch origin main` fails (e.g. network error)
- **THEN** `scripts/git-safe-push.sh` SHALL log a warning and exit zero without altering the already-successful push

<!-- merged from change delta divergence-guard.md on 2026-07-01 -->

### Requirement: Branch name validation before worktree creation

`scripts/worktree-create.sh` SHALL reject a branch name that violates the naming convention
enforced by `.githooks/pre-commit` — a valid type prefix (`feature/`, `fix/`, `chore/`, `docs/`)
and an uppercase ticket ID matching `T[0-9]{6,}` — before performing any mutation, and SHALL exit
non-zero without creating a worktree.

The check SHALL apply the same exemptions as the hook (`main`, `develop`, `master`,
`release-please--*`, `dependabot/*`, `renovate/*`), SHALL apply to already existing branches as
well as newly created ones, and SHALL be bypassable via `WT_SKIP_NAME_CHECK=1`.

The rejection message SHALL name each violated condition individually and, where a correction is
derivable, SHALL print the corrected invocation.

#### Scenario: A lowercase ticket ID

- **GIVEN** the branch name `chore/mishap-t002407`, which the pre-commit hook rejects
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits non-zero, creates no worktree, and prints `chore/mishap-T002407` as the
  corrected invocation

#### Scenario: An invalid type prefix

- **GIVEN** the branch name `feat/auto-triage-T002399`, whose prefix is not among the four allowed
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits non-zero and creates no worktree

#### Scenario: A conforming name

- **GIVEN** the branch name `fix/branch-name-guard-T002470`
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits zero and the worktree is created

#### Scenario: An exempt branch

- **GIVEN** the branch name `renovate/npm-lodash`
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** the guard does not fire and the worktree is created

#### Scenario: An existing branch that violates the convention

- **GIVEN** the branch `chore/mishap-t002424` already exists locally
- **WHEN** `scripts/worktree-create.sh` runs with that name
- **THEN** it exits non-zero and creates no worktree, because a commit on that branch would fail
  just the same

### Requirement: No mutation before argument validation

`scripts/worktree-create.sh` SHALL validate its branch-name argument before the divergence guard
runs, so that a rejected invocation performs no `git stash`, no `git pull` and no worktree removal
in the invoking checkout.

#### Scenario: A rejected name leaves uncommitted work untouched

- **GIVEN** the invoking checkout carries uncommitted changes
- **WHEN** `scripts/worktree-create.sh` runs with a branch name that violates the convention
- **THEN** it exits non-zero and the stash list is unchanged, with the uncommitted changes still
  present in the working tree

### Requirement: Observable drift between hook and helper

Because the naming rule is deliberately implemented twice — the `pre-commit` hook stays free of
repository file dependencies, so that a missing library file cannot block every commit — the test
suite SHALL fail when the ticket-ID pattern, the exemption list or the set of allowed type
prefixes differ between `.githooks/pre-commit` and `scripts/worktree-create.sh`.

#### Scenario: The hook pattern is changed alone

- **GIVEN** the ticket-ID pattern is edited in `.githooks/pre-commit` but not in
  `scripts/worktree-create.sh`
- **WHEN** the test suite runs
- **THEN** the drift guard fails

<!-- merged from change delta divergence-guard.md (ae8de5af3162) -->