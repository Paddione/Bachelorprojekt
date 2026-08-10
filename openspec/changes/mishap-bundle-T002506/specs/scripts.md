## ADDED Requirements

### Requirement: Ticket-ID matching identifies the squash commit by subject only

`scripts/agent-lock-merged.sh` and `scripts/devflow-post-merge-deploy.sh` SHALL locate a
ticket's merge commit by matching the bracketed ticket ID in the commit **subject**, which is
where the PR title places it under the squash-merge convention. They SHALL NOT accept a match
found only in the commit body, and they SHALL NOT restrict the search to commits with more than
one parent — a squash merge has exactly one.

#### Scenario: A ticket ID mentioned in a foreign commit body is not treated as proof of merge

- **GIVEN** a commit whose subject carries `[T002493]` and whose message body mentions `[[T002494]]`
- **WHEN** `agent-lock-merged.sh check-merged` is asked about `T002494`
- **THEN** it reports "not merged", because no commit subject carries `[T002494]`

#### Scenario: A squash-merge commit is found despite having a single parent

- **GIVEN** `origin/main` whose tip is a squash commit with subject `fix(factory): … [T002501] (#3572)`
- **WHEN** `devflow-post-merge-deploy.sh T002501` runs
- **THEN** it finds that commit and proceeds to the deploy-trigger evaluation instead of failing
  with "no merge commit found"

### Requirement: A ticket ID reaches `git log --grep` only in validated form

`scripts/devflow-post-merge-deploy.sh` SHALL validate that its ticket argument matches `T######`
before interpolating it into a `--grep` pattern. A malformed argument is a usage error, not a
regular expression.

#### Scenario: A malformed ticket ID is rejected instead of interpreted as a pattern

- **GIVEN** the argument `T[0-9]` instead of a ticket ID
- **WHEN** `devflow-post-merge-deploy.sh` runs
- **THEN** it exits non-zero with a format error and never reaches `git log`

### Requirement: Collision reporting checks the peer worktree on disk

`scripts/agent-collision.sh` SHALL, in `--branch` mode, report a file as colliding only when that
file actually exists in the peer worktree. A lock whose recorded worktree stands on a different
branch SHALL NOT produce a collision warning.

#### Scenario: A newly added file does not collide with a worktree that does not contain it

- **GIVEN** a peer worktree checked out on an unrelated branch
- **WHEN** the current branch adds a file that does not exist there
- **THEN** no COLLISION is reported

### Requirement: The File-Structure region ends at task headings of every documented shape

`scripts/plan-lint.sh` SHALL treat both the next H2 and a `### Task …` H3 heading as the end of
the `## File Structure` region, including the unnumbered template form `### Task N: <Name>`.
Without this, a plan whose tasks live under H3 keeps its whole task body inside the
File-Structure region, and W3 reports every declared file as unreferenced.

#### Scenario: A plan with H3 task headings produces no W3 false negative

- **GIVEN** a plan that declares files under `## File Structure` and lists its tasks as `### Task 1: …`
- **WHEN** `plan-lint.sh` runs on it
- **THEN** W3 reports no unreferenced files, because the task bodies are read as references

### Requirement: A plan fixture never claims a line budget for the file that measures it

A plan used as a test fixture SHALL NOT state a numeric S1 budget for `scripts/plan-lint.sh`
itself. The B1a gate compares such a claim against the live residual budget of that same file,
so every edit to the linter would turn the fixture's gate red without anything being wrong.

#### Scenario: Editing the linter does not break the fixture gate

- **GIVEN** the fixture plan `openspec/changes/task-context-channel/tasks.md`
- **WHEN** `scripts/plan-lint.sh` grows or shrinks by any number of lines
- **THEN** the TCC gate still passes, because the fixture claims no number for that file
