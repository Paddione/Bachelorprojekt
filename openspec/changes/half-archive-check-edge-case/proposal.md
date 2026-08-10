# Proposal: half-archive-check-edge-case

## Why

`scripts/openspec-half-archive-check.sh` (T002428) detects a slug that exists both
under `openspec/changes/<slug>/` and `openspec/changes/archive/<date>-<slug>/`. Its
detection logic is filesystem-based (`find` against the two real directories) and,
verified by direct reproduction, DOES correctly flag such a duplicate even when it
is entirely uncommitted. The gap is not in the detection logic — it is in when the
check runs. Today it is wired into exactly one place: `task test:openspec` (used by
`task test:all` and CI). Nothing invokes it against a live working tree at the point
a half-archived state is actually created.

On 2026-08-09 exactly that state existed, uncommitted, in the main checkout: three
change directories showed up simultaneously as deleted under `openspec/changes/` and
as untracked under `openspec/changes/archive/2026-08-09-*`, with `qwen3-coder-loadout`'s
delta requirement not yet merged into its SSOT spec. The state originated from an
`openspec.sh archive` run in a session whose PID no longer existed — an interrupted
agentic run, not a hook or `cmd_archive` bug. Nobody ran `task test:openspec` in that
working tree before the session ended, so the guard never got a chance to fire; the
state was found only by chance via `git status` and repaired by resetting the working
tree (verified byte-identical to `origin/main`, so no content was lost).

## What

Wire the existing, already-correct half-archive check into two points that run
*before* CI ever sees the tree:

1. **Pre-commit hook** (`.githooks/pre-commit`) — fail-closed. Any commit that would
   leave `openspec/changes/` in a half-archived state is refused, the same way the
   git-crypt and freshness guards already refuse commits today. This closes the path
   where a half state gets *committed* piecemeal.
2. **Session hygiene reap** (`scripts/agent-lock.sh reap`) — advisory (warns on
   stderr, does not fail the reap). `reap` already runs at the start of every
   `dev-flow-plan`/`dev-flow-execute` session (Schritt −1: "Reaper &
   Stale-Worktree-Audit") specifically to clean up residue left by dead sessions —
   which is exactly the origin of this mishap. An advisory warning here surfaces the
   drift proactively, without requiring anyone to attempt a commit first.

Both call sites reuse `scripts/openspec-half-archive-check.sh` unmodified — no change
to its detection logic, which was verified correct in isolation.

_Ticket: T002824_
