---
ticket_id: T000526
status: in-progress
domains: [infra, test]
---

# Fix: worktree-create.sh provisions node_modules (offline gate works in worktrees)

**Ticket:** T000526 · **Branch:** `fix/worktree-node-modules`

## Problem

`scripts/worktree-create.sh` inits submodules but never provisions the
gitignored root `node_modules` (~536M, only in the base checkout). git worktrees
don't share it, so `task test:all`'s node-importing subtasks (`test:docs-gen`,
`test:agent-guide`) die with `ERR_MODULE_NOT_FOUND` (cheerio/gray-matter) in a
fresh worktree — exactly the dev-flow default. CI is green (it runs `npm ci`).

T000427 already added `[ -d node_modules ] || npm ci` guards to those tasks, but
under the **concurrent** `task test:all` they race: `npm ci` creates the
`node_modules/` dir early, so a parallel task sees `-d node_modules` true, skips
its own install, and imports before deps are written → the same error.

## Fix (TDD, red→green)

- **Test first (RED):** two cases in `tests/unit/worktree-create.bats` — a base
  with `node_modules` must leave it resolvable from the worktree root; a base
  without one must still succeed (no dangling link). Confirmed red before the fix.
- **Script (GREEN):** after submodule init, symlink the base checkout's
  `node_modules` (`dirname` of the shared git-common-dir) into the worktree when
  present and absent in the worktree. Instant, no reinstall; the existing
  `[ -d node_modules ] || npm ci` guards then short-circuit, so the concurrency
  race never triggers in worktrees. Skipped cleanly when the base has none.

## Verification

- `tests/unit/worktree-create.bats`: 8/8 green (2 new). `test-tasks-node-deps`
  (T000427) still green. `bash -n` clean.
- End-to-end in a real worktree (symlinked node_modules): `task test:docs-gen`,
  `task test:agent-guide`, full `task test:all`, and `task freshness:check` all
  exit 0 — previously red on ERR_MODULE_NOT_FOUND.
- `node_modules` is gitignored → the symlink never appears in `git status`.

## Files

- `scripts/worktree-create.sh`
- `tests/unit/worktree-create.bats`
