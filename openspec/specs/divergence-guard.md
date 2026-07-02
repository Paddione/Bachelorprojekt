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