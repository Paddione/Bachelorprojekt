# Proposal: t002204-worktree-lock

## Why

Two mishaps in dev-tooling scripts:

1. **worktree-create.sh**: Missing `mentolder-web/node_modules` symlink causes
   `task test:changed` to fail in every worktree (vitest not found).

2. **agent-lock.sh reap**: Session resume changes the process SID, causing `reap` to
   delete live locks. Pre-Commit Guard then fails with false "branch mismatch".

## Changes

### Fix 1: worktree-create.sh — link all workspace package node_modules
- Parse `pnpm-workspace.yaml` for workspace packages
- Link `node_modules` for each workspace package found in the source checkout
- Warn if source checkout is on a different branch (potential dependency incompatibility)

### Fix 2: agent-lock reap — don't remove locks with matching worktree+branch
- Before removing a lock in `reap`, check if the lock's worktree path exists AND
  the branch in the worktree matches the lock's branch
- Also: consider using `--git-common-dir` instead of `.git/agent-locks/` (already
  fixed in T002188 for the SKILL.md guards)

## Trade-offs

- Symlink-based node_modules linking is inherently fragile across branches. The
  branch-warning mitigates this. A future enhancement could `pnpm install` directly.

## Risks

- If the source checkout has different dependencies installed, linked node_modules
  can cause false test failures. The branch-warning at least alerts the user.
