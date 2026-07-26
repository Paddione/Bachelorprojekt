## ADDED Requirements

### Requirement: Empty-branch push guard

The `pre-push` hook SHALL refuse to create a new remote branch that has no commits ahead of
`origin/main`, and SHALL warn (without blocking) when an already existing remote branch is
pushed with no new commits. The guard SHALL be bypassable via `SKIP_EMPTY_BRANCH_CHECK=1`
and SHALL never interfere with branch deletions or with pushes of `main`.

#### Scenario: A rejected commit followed by an unchained push

- **GIVEN** a commit-msg gate has rejected the commit, so the branch still points at `origin/main`
- **WHEN** `git push -u origin <new-branch>` runs anyway
- **THEN** the pre-push hook exits non-zero and no empty branch reaches the remote

#### Scenario: A normal first push of a branch with commits

- **GIVEN** a new branch carrying at least one commit ahead of `origin/main`
- **WHEN** it is pushed for the first time
- **THEN** the hook exits zero and the push proceeds

### Requirement: Nearest-scope suggestion on unknown commit scopes

`scripts/validate-commit-msg.sh` SHALL, when rejecting an unknown commit scope, emit a
"did you mean '<scope>'" line naming the nearest registered scope, using prefix, shared-prefix
and substring matching. It SHALL emit no suggestion when no scope is plausibly related.

#### Scenario: A near-miss scope

- **GIVEN** the commit subject `fix(agents): …` and the registered scope `agent-guide`
- **WHEN** the validator rejects the subject
- **THEN** the output names `agent-guide` as the suggestion, and that scope validates

#### Scenario: An unrelated scope

- **GIVEN** the commit subject `chore(zzzzznope): …`
- **WHEN** the validator rejects the subject
- **THEN** no "did you mean" line is emitted

### Requirement: Mishap-tracker slug and branch name are distinct

The `mishap-tracker` skill SHALL define the openspec change directory slug as fully lowercase
and the branch name with the ticket ID unchanged (`chore/mishap-<ext-id>`), SHALL NOT derive
the branch name from the lowercase slug, and SHALL document the case-sensitive
`T[0-9]{6,}` branch check in `.githooks/pre-commit` that makes the distinction necessary.

#### Scenario: Staging a non-critical mishap bundle

- **GIVEN** the external ticket id `T002239`
- **WHEN** the skill's Step 3.5 derives slug and branch
- **THEN** the slug is `mishap-t002239` and the branch is `chore/mishap-T002239`, which
  satisfies the pre-commit branch-naming check

### Requirement: Eval replay dry-run is repository-state independent

`scripts/factory/eval-replay.mjs` SHALL NOT create a git worktree in `--dry-run` mode. It
SHALL verify the fixture's `base_commit` resolves locally and return without mutating the
shared repository, so `FA-SF-72` passes regardless of whether local `main` is behind
`origin/main` or checked out in another worktree.

#### Scenario: Dry-run replay while local main is behind origin/main

- **GIVEN** local `main` is behind `origin/main` and checked out in another worktree
- **WHEN** `eval.mjs --replay --fixture <id> --dry-run` runs
- **THEN** it exits zero, records `mode=replay`, and leaves the worktree and branch lists unchanged
