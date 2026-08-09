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

### Requirement: Shared source for the branch-naming rule

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

### Requirement: Declared paths in `.dockerignore` exist

The test suite SHALL fail when `.dockerignore` declares a literal path that does not exist in the
working tree.

A line is in scope only when all of the following hold. It is neither blank nor a comment. It does
not begin with `!` — a negation pattern, whose target is legitimately allowed to be absent. It
contains none of the glob metacharacters `*`, `?` or `[`. And it does not carry the trailing marker
`# runtime`.

The `# runtime` marker exists because a path may be both glob-free and legitimately absent from a
fresh checkout: `website/dist`, `mentolder-web/node_modules` and `tests/e2e/test-results` are
produced by a build, an install and a test run respectively. Marking them in the file itself keeps
the justification next to the entry rather than in a separate allowlist that drifts from it. The
marker SHALL name the producing step, so that a future reader can tell an artefact from a
leftover.

The check SHALL verify that the set of in-scope lines is non-empty before asserting that none of
them is missing, so that an extraction returning nothing fails loudly instead of passing
vacuously.

#### Scenario: Every declared literal path exists

- **GIVEN** every non-negation, glob-free line in `.dockerignore` names an existing path
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A declared path was deleted

- **GIVEN** `.dockerignore` names `billing-bot`, which does not exist in the working tree
- **WHEN** the test suite runs
- **THEN** the check fails and the failure message names `billing-bot`

#### Scenario: A negation pattern is not treated as a missing path

- **GIVEN** `.dockerignore` contains `!website/.env.example` and that file does not exist
- **WHEN** the test suite runs
- **THEN** the check passes, because negation patterns are out of scope

#### Scenario: A marked runtime artefact is not treated as a missing path

- **GIVEN** `.dockerignore` contains `website/dist  # runtime: astro build` and that directory does
  not exist in a fresh checkout
- **WHEN** the test suite runs
- **THEN** the check passes, because the entry carries the `# runtime` marker

#### Scenario: An unmarked runtime artefact still fails

- **GIVEN** `.dockerignore` contains a glob-free path that does not exist and carries no `# runtime`
  marker
- **WHEN** the test suite runs
- **THEN** the check fails, so that adding an artefact requires stating why it may be absent

#### Scenario: The extraction returning nothing fails

- **GIVEN** the extraction of in-scope lines yields an empty set
- **WHEN** the test suite runs
- **THEN** the check fails, rather than reporting success over an empty candidate set

### Requirement: Service-registry entries point at existing manifests

The test suite SHALL fail when a manifest key in `scripts/factory/service-registry.sh` names a path
that does not exist in the working tree.

Keys are the bracketed array subscripts of the registry map, of the form `[<path>]=`. The check
SHALL verify that at least one key was extracted before asserting that none is missing.

#### Scenario: Every registry key resolves

- **GIVEN** every manifest key in the registry names an existing path
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A registry entry outlived its manifest

- **GIVEN** the registry contains the key `[k3d/claude-code-mcp-browser.yaml]` and that file does
  not exist
- **WHEN** the test suite runs
- **THEN** the check fails and the failure message names the offending key

#### Scenario: The extraction returning nothing fails

- **GIVEN** the extraction of registry keys yields an empty set
- **WHEN** the test suite runs
- **THEN** the check fails, rather than reporting success over an empty candidate set

### Requirement: No tracked symlink dangles

The test suite SHALL fail when a symlink tracked in git cannot be resolved from the working tree.

Tracked symlinks are the entries reported by `git ls-files -s` with mode `120000`. A symlink is
considered dangling when `test -e` on its path is false. This catches the class of file that
`git ls-files` reports but `cat` cannot open — in particular a link committed against an absolute
path on one contributor's machine.

The check SHALL verify that at least one tracked symlink exists before asserting that none
dangles.

#### Scenario: Every tracked symlink resolves

- **GIVEN** every tracked symlink resolves within the working tree
- **WHEN** the test suite runs
- **THEN** the check passes

#### Scenario: A symlink points outside the repository

- **GIVEN** a tracked symlink points at an absolute path under a contributor's home directory that
  does not exist in this checkout
- **WHEN** the test suite runs
- **THEN** the check fails and the failure message names the symlink and its target

#### Scenario: The repository-internal relative symlinks are recognised

- **GIVEN** `.agents/agents` is a tracked symlink to `../.claude/agents`, which exists
- **WHEN** the test suite runs
- **THEN** the check passes for that entry, so that the repository's deliberate compatibility
  symlinks are not reported as drift

<!-- merged from change delta divergence-guard.md (17ddcee4d4b6) -->

<!-- merged from change delta divergence-guard.md (ed706757ec2f) -->