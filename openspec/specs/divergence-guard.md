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

### Requirement: Divergence-Guard skips the auto-stash when a foreign process holds the main checkout dirty

`scripts/worktree-create.sh`'s divergence-guard sync path (local `main` behind `origin/main`)
SHALL NOT run `git stash push` on the main checkout when BOTH of the following hold:

- a foreign `claude` or `opencode` process has its `cwd` inside the main checkout (detected
  via `/proc/<pid>/cwd`, excluding the current session's own PID/parent chain), AND
- `git status --porcelain` on the main checkout is non-empty.

In that case the guard SHALL print a warning naming the skipped sync and proceed to create
the worktree from `origin/main` directly (`BASE=origin/main`), without mutating the main
checkout. The existing safeguard against the script's OWN failed `stash pop`
(`_wc_stash_pop_or_warn`, T002673) remains unchanged and still applies whenever a stash IS
performed (i.e. the foreign-activity guard did not fire).

#### Scenario: Foreign session with uncommitted changes blocks the auto-stash

- **GIVEN** local `main` is behind `origin/main`
- **AND** the main checkout has uncommitted changes (`git status --porcelain` non-empty)
- **AND** a `claude` or `opencode` process other than the current session has its `cwd`
  inside the main checkout
- **WHEN** `scripts/worktree-create.sh` runs the divergence-guard sync path
- **THEN** it does NOT run `git stash push` on the main checkout
- **AND** the main checkout's working tree is unchanged afterward (same uncommitted diff as
  before the run)
- **AND** the new worktree is created successfully from `origin/main`

#### Scenario: Dirty checkout without any foreign process still auto-stashes (regression guard)

- **GIVEN** local `main` is behind `origin/main`
- **AND** the main checkout has uncommitted changes
- **AND** no foreign `claude`/`opencode` process has its `cwd` inside the main checkout
- **WHEN** `scripts/worktree-create.sh` runs the divergence-guard sync path
- **THEN** it stashes, pulls, and pops as before (unchanged behavior — this is the
  positive-anchor case for the guard above: it must still stash when there is no foreign
  activity to protect)

<!-- merged from change delta divergence-guard.md (defc0c2bfb3e) -->

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

<!-- merged from change delta divergence-guard.md (098c74f2316c) -->

### Requirement: Repository integrity is verified before worktree hygiene operations

The system SHALL verify the integrity of the shared object store before any
worktree/branch cleanup run. `scripts/git-worktree-health.sh objects` SHALL report
zero-byte loose objects (`find <git-dir>/objects -type f -size 0`) and verify the object
store with `git fsck --no-reflogs --no-progress`. The exit-code contract SHALL be 0 for a
clean store, 1 for a finding, and 2 when the check cannot be performed (no repository or
`git fsck` unusable). On a finding, the output SHALL include the documented rescue sequence:
reconstruct a worktree HEAD from its `.git/worktrees/<name>/logs/HEAD`, run
`git rebase --abort` in the affected worktree, delete the zero-byte objects, and run
`git reflog expire --stale-fix --all`, followed by a `git fsck --no-reflogs` counter-check.

#### Scenario: A single worktree carries truncated objects and blocks fetch

- **GIVEN** the repository contains zero-byte loose objects, including the detached HEAD of one worktree
- **WHEN** `git-worktree-health.sh objects` runs before the hygiene run
- **THEN** it exits 1
- **AND** it prints the rescue sequence that restores the worktree HEAD from `logs/HEAD`
- **AND** after the sequence `git fsck --no-reflogs` reports a clean store and `git fetch` works again

#### Scenario: The object store is intact

- **GIVEN** a repository without zero-byte loose objects and a clean `git fsck --no-reflogs`
- **WHEN** `git-worktree-health.sh objects` runs
- **THEN** it exits 0 without printing the rescue sequence

#### Scenario: The integrity check cannot run

- **GIVEN** a directory that is not a git repository, or a `git fsck` that fails
- **WHEN** `git-worktree-health.sh objects` runs
- **THEN** it exits 2 and prints no verdict

### Requirement: A dirty finding is confirmed by a second measurement

The per-worktree cleanliness check SHALL confirm a dirty finding with a second
`git status --porcelain` run before reporting it. Only residues reported identically by
both runs are a finding. A residue that appears only in the first run SHALL be treated as a
stat-cache refresh artifact (stale mtimes after a crash) and SHALL NOT block a removal or
trigger a ticket assignment.

#### Scenario: A transient dirty report after a crash is not a finding

- **GIVEN** a worktree whose file mtimes differ from the index stat cache (e.g. after a crash)
- **WHEN** the cleanliness check runs its first `git status --porcelain`
- **AND** the first run reports modified files whose content is identical to the index
- **THEN** the second run reports no residues
- **AND** the check exits 0 and notes that the stat cache was refreshed

#### Scenario: A persistent dirty state is still a finding

- **GIVEN** a worktree with genuinely modified, non-allowlisted files
- **WHEN** the cleanliness check runs twice
- **THEN** both runs report the same residues
- **AND** the check exits 1

### Requirement: Worktree iteration is registration-based, orphan directories are a finding

Worktree enumeration in hygiene and ticket-ops flows SHALL iterate over
`git worktree list --porcelain` (the registration), not over the filesystem glob
`.worktrees/*/`. A directory under `.worktrees/` that has no entry in the porcelain output
SHALL be reported as a finding by `scripts/git-worktree-health.sh orphans` — orphaned
directories are either garbage or lost work and SHALL be named, never silently counted as a
clean worktree. Any `git -C <dir>` call in such a loop SHALL be guarded by
`[ -e "$dir/.git" ]` so that git's upward search cannot answer for the parent repository.

#### Scenario: An orphan directory is measured against the parent repository

- **GIVEN** a directory `.worktrees/<name>` that contains no `.git` and is not registered in `git worktree list`
- **WHEN** a hygiene loop enumerates worktrees via the `.worktrees/*/` glob
- **THEN** the loop SHALL NOT report `branch=main, dirty=0` for it
- **AND** `git-worktree-health.sh orphans` SHALL name the directory as a finding

#### Scenario: Registered worktrees are enumerated via porcelain

- **GIVEN** a repository with several registered worktrees
- **WHEN** a hygiene or ticket-ops flow enumerates worktrees
- **THEN** the enumeration matches `git worktree list --porcelain` exactly

### Requirement: The auto-stash restore resolves the stash by message, not by index

`scripts/worktree-create.sh` SHALL restore its automatically created stash
(`worktree-create-auto-stash`) by locating the entry through its message, never by the
positional index `stash@{0}`. The shared stash stack (`refs/stash` in the common git dir)
is mutated by every worktree in the repository, so a positional index is not stable.
`scripts/git-stash-net.sh` SHALL provide message-based operations (`find --by-ticket`,
`pop --by-message`) as the reference implementation and SHALL drop an entry only when the
pop applied completely.

#### Scenario: A foreign push shifted the stash indices

- **GIVEN** a shared stash stack where a foreign session pushed new entries above `stash@{0}`
- **WHEN** `worktree-create.sh` restores its auto-stash
- **THEN** it locates the entry by the message `worktree-create-auto-stash`, not by `stash@{0}`

#### Scenario: A partial pop keeps the safety net entry

- **GIVEN** a stash whose pop applies only partially (a file was regenerated in between)
- **WHEN** `git-stash-net.sh pop --by-message` runs
- **THEN** it reports the partial pop as a finding and keeps the stash entry

<!-- merged from change delta divergence-guard.md (e49c885971f4) -->