---
ticket_id: T006290
plan_ref: openspec/changes/agent-lock-release-cwd/tasks.md
status: active
date: 2026-08-15
---

# Design: agent-lock-release-cwd

## Goals

- `agent-lock.sh release branch <b>` SHALL refuse to release when the caller's current
  working directory lies inside the worktree recorded in the branch-scoped lock.
- The refusal SHALL name the reason and the remedy (`cd` into the main repo first) on stderr.
- The lock SHALL remain in place when the release is refused, so a later correct call can
  still release it.
- The cleanup sequences in the skills (git-workflow Schritt 7, session-coordination
  §Freigeben, dev-flow-chore Schritt 6) SHALL run release AFTER changing into the main
  repo, and SHALL NOT swallow the refusal via `2>/dev/null || true`.

## Non-Goals

- No change to ticket-scoped releases (`release ticket`): no worktree removal is the
  documented follow-up step there, and factory callers (qa-lens.mjs, mishap-rollup.sh)
  run from the repo root.
- No auto-removal of worktrees from within agent-lock.sh — removal stays with the caller.
- No change to `claim`, `check`, `refresh`, `reap`.

## Root Cause (verified 2026-08-15)

Reproducer (sandbox in /tmp, not the real repo):

```bash
git init main && git worktree add -b fix/demo ../wt
cd ../wt
git worktree remove /tmp/.../wt --force   # rc=0 — the removal itself succeeds
git worktree prune                         # fatal: Unable to read current working directory (rc=128)
```

Once `git worktree remove` deletes the directory that is the shell's cwd, every later
command in that shell fails with `Unable to read current working directory`. In the
reported mishap (chore/ci-kubeconfig-umask-T005902) the documented sequence
"release → worktree remove → prune → push --delete → branch -D" ran from inside the
worktree; the removal succeeded, all follow-up commands died, and `release branch` (or
its verification) never completed, leaving the lock stale until `reap`.

## Decisions

### D1: Refuse branch-scoped release while cwd is inside the lock's worktree

`cmd_release` for scope `branch` SHALL refuse (exit 1) when the lock has a `worktree`
field and the caller's `$PWD` (or its git toplevel) falls inside that path. The
containment test mirrors `_lock_is_mine` (T003110): exact match or prefix match on both
`$PWD` and `git rev-parse --show-toplevel`.

Why refuse instead of warn: the documented next step after `release branch` is
`git worktree remove` — executing it from the destroyed cwd kills the session and
reproduces the stale-lock mishap. A warning would still let the sequence run to the
fatal step. `--force` remains the explicit override for the legitimate case where the
lock is released while the worktree is kept.

### D2: Keep the release refusal visible in the skill sequences

The skill cleanup blocks currently run `release ... 2>/dev/null || true`. With a
refusing guard this swallows the error and the sequence would continue into the
worktree removal anyway. The skill sequences therefore change to run the release from
the main repo (after `cd "$MAIN_REPO"`) and without the stderr redirect, so a refusal
is visible and stops the operator.

## Affected files

- `scripts/agent-lock.sh` (cmd_release guard)
- `.claude/skills/git-workflow/SKILL.md` (Schritt 7 sequence)
- `.claude/skills/references/session-coordination.md` (§Freigeben)
- `.claude/skills/dev-flow-chore/SKILL.md` (Schritt 6)
- `tests/spec/active-sessions-hub/agent-lock-release-cwd.bats` (new RED test)

## Edge cases

- Lock without `worktree` field (older claims, `-`): guard skips, release as before.
- cwd in a subdirectory of the worktree (e.g. `scripts/`): contained, refused.
- cwd in the main repo but worktree still exists: release succeeds (normal path).
- `--force`: releases regardless of cwd (documented override, same flag semantics as
  foreign-lock release).
- Ticket-scoped locks: unchanged.
