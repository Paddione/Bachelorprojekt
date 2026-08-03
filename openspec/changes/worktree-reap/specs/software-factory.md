## ADDED Requirements

### Requirement: Session-Start Reaper removes orphaned worktrees and squash-merged branches

`bash scripts/agent-lock.sh reap` SHALL remove a local worktree directory and its branch when the
branch is provably obsolete, and SHALL preserve every worktree and branch that is not. This
extends the existing session-start reaper, which until now only dropped stale lock files and
pruned git worktree administrative metadata.

A branch counts as obsolete only when ALL of the following hold:

1. an upstream was configured for it AND the corresponding remote-tracking ref no longer exists
   (a branch with no upstream at all SHALL NOT qualify — it may be unpushed local work),
2. its name contains a ticket id matching `T[0-9]{6}` whose ticket status is `done` or `archived`
   (no id in the name, or an unreadable status, SHALL disqualify the branch),
3. if a worktree holds the branch, `git status --porcelain` in that worktree is empty,
4. no live agent-lock claim exists for the branch.

Obsolescence SHALL NOT be decided by `git branch --merged main`. Squash-merge is the repository's
merge mode, and a squash-merged branch tip is never an ancestor of `origin/main`, so that filter
matches no merged branch at all.

Before deleting a branch, the system SHALL create the local tag `reaped/<branch>` on its tip SHA,
so the commit remains recoverable after the branch ref is gone. Deletion SHALL use `git branch -D`
— `git branch -d` can never succeed for a squash-merged branch.

The worktree from which `reap` is currently running SHALL NEVER be a candidate for removal.

Every candidate that is skipped by one of the criteria above SHALL produce one line on stderr
naming the worktree or branch and the reason. Branches whose remote-tracking ref still exists
SHALL produce no output.

The ticket status lookup SHALL be performed only after criteria 1, 3 and 4 have passed, so that a
normal `reap` with no obsolete candidates performs no ticket lookups at all. The lookup SHALL be
routed through the `TICKET_SH` environment override, as `scripts/branch-reaper.sh` already does,
so the behaviour is testable against a fixture repository without a cluster.

#### Scenario: Orphaned worktree of a squash-merged branch is reaped

- **GIVEN** a local branch whose name carries a ticket id with status `done`, whose upstream was
  configured but whose remote-tracking ref is gone, held by a worktree with a clean working tree
  and no live agent-lock claim
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the worktree directory no longer exists, the branch ref is gone, the tag
  `reaped/<branch>` points at the former tip SHA, and stderr names the reaped worktree

#### Scenario: Active worktree with a live upstream survives

- **GIVEN** a local branch whose remote-tracking ref still exists, held by a worktree
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the worktree directory and the branch still exist, and stderr contains no line naming
  that worktree

#### Scenario: Uncommitted changes block the removal

- **GIVEN** an otherwise obsolete branch whose worktree has at least one entry in
  `git status --porcelain`
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the worktree directory and the branch still exist, and stderr names the worktree with
  the reason

#### Scenario: Branch without upstream is never reaped

- **GIVEN** a local branch that has no upstream configured at all, with a clean worktree and a
  ticket status of `done`
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the worktree directory and the branch still exist

#### Scenario: Squash-merged branch without a worktree is reaped by the same criteria

- **GIVEN** an obsolete branch as defined above that is not checked out in any worktree
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the branch ref is gone and the tag `reaped/<branch>` points at its former tip SHA
