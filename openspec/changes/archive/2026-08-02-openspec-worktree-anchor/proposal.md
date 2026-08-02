# Proposal: openspec-worktree-anchor

## Why

`scripts/openspec.sh` and `scripts/openspec-status-map.sh` derive their repo
root via `dirname "${BASH_SOURCE[0]}"` — i.e. the physical path the script
file was invoked with, not the caller's actual working directory. In a
worktree setup, each worktree has its own copy of `scripts/`. Invoking the
script with a wrong relative path (e.g. `../../scripts/openspec.sh` from
inside `.worktrees/<slug>/`, which resolves two levels up into the **main
repo root**) makes `REPO` point at the wrong checkout even though `$PWD` was
correct — silently writing `openspec/changes/<slug>/` into the main
checkout instead of the worktree. This is exactly the anti-pattern
documented in `CLAUDE.local.md` (T001880: mutating commands never belong in
the main checkout).

Live-observed during T001995 planning (T001997 mishap): `bash
../../scripts/openspec.sh propose ...` from inside the worktree landed the
change folder in the main checkout. Caught immediately (untracked files
showed up in `git status` on main) and cleaned up before anything was
committed.

## What

Derive `REPO` from `git rev-parse --show-toplevel` (anchored on the
caller's `$PWD`) instead of `dirname "${BASH_SOURCE[0]}"`, in both
`scripts/openspec.sh` and `scripts/openspec-status-map.sh`. This makes the
scripts immune to being invoked via a wrong relative/absolute path — as
long as the caller's working directory is the intended checkout, that's
where the artifacts land.

_Ticket: T001997_
