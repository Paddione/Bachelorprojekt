## ADDED Requirements

### Requirement: Local branch delete keeps branches with unmerged commits

Before deleting the local `plan_ref` branch in step 10,
`scripts/devflow-post-merge-finalize.sh` SHALL verify that the branch carries no
commits outside `origin/main` (e.g. `git log --oneline origin/main..<branch>` is
empty after fetch, or `git merge-base --is-ancestor`). The PR of the ticket may
have run on a different branch than the one named in `plan_ref` — exactly the
T900078 case (PR #5508 on `fix/...`, `plan_ref` naming `feature/...`).

#### Scenario: Branch with unmerged commits is kept

- **GIVEN** the `plan_ref` branch contains commits not reachable from `origin/main`
- **WHEN** step 10 of `devflow-post-merge-finalize.sh` runs
- **THEN** the local branch is NOT deleted, a warning names the unmerged commits,
  and the run continues without data loss

#### Scenario: Fully merged branch is deleted as before

- **GIVEN** the `plan_ref` branch carries no commits outside `origin/main`
- **WHEN** step 10 of `devflow-post-merge-finalize.sh` runs
- **THEN** the local branch is deleted and the run reports it as done

### Requirement: Archive section aborts on dirty worktree instead of discarding or absorbing foreign work

Step 8 of `scripts/devflow-post-merge-finalize.sh` SHALL check the working tree
for uncommitted changes (tracked modifications and untracked files) BEFORE
`git checkout -B "$ARCHIVE_BRANCH" origin/main`. If the tree is dirty, the
script SHALL abort fail-closed with a FATAL message naming the dirty paths,
instead of discarding them (`git checkout -- .` / `git clean -fd`) or absorbing
them into the archive commit. `archive_stage_commit` with
`archive_assert_staged_scope` remains the second net for the staged set.

#### Scenario: Dirty main checkout aborts the archive

- **GIVEN** the shared checkout holds uncommitted changes from another session
  (e.g. tracked-modified `docs/agent-guide/registry/agents.yaml`)
- **WHEN** step 8 of `scripts/devflow-post-merge-finalize.sh` starts
- **THEN** the script exits non-zero with a FATAL message before switching
  branches, and no foreign path enters the archive branch

#### Scenario: Clean tree archives exactly the change scope

- **GIVEN** the working tree is clean
- **WHEN** step 8 runs
- **THEN** archiving proceeds and the archive commit contains only
  `archive_assert_staged_scope`-approved paths

### Requirement: Reaper keeps branches with commits outside main

`scripts/branch-reaper.sh` SHALL NOT delete a remote branch whose tip is not an
ancestor of the remote `main` (unmerged work of another ticket), even when all
blob deviations are allowlisted. It SHALL report KEEP with the T900096 reason.

#### Scenario: Reaper spares branch with unmerged commits

- **GIVEN** a candidate remote branch tip is not reachable from the remote `main`
- **WHEN** `scripts/branch-reaper.sh` evaluates it
- **THEN** the branch is kept with a message naming the unmerged-commits reason
