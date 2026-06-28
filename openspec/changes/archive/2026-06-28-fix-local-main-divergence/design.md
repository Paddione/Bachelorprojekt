## Context

Local `main` can diverge from `origin/main` (no common ancestor) after a rebase on the local branch. This causes `git merge-base` to fail and makes rebasing feature branches impossible (accumulating 800+ unrelated commits). The workaround is `git reset --hard origin/main`, but this is not documented or enforced anywhere.

## Goals / Non-Goals

**Goals:**
- Fail fast with a clear error when local main is diverged
- Prevent worktree creation on a diverged base
- Include the recovery command in the error message

**Non-Goals:**
- Fixing how the divergence happens (root cause is human error)
- Auto-resetting local main (too destructive for automated action)

## Decisions

- **Single guard location**: Add check at the top of `scripts/worktree-create.sh` — the single entry point for all worktree creation. No need to replicate in agent-lock or other scripts.
- **Guard mechanism**: `git merge-base --is-ancestor origin/main main` — returns 0 if ancestor, 1 if not. Simple, fast, no side effects.
- **Error format**: Clear message + recovery command, stderr, exit 1.

## Risks / Trade-offs

- [Low] Guard adds ~5ms to worktree creation — negligible.
- [Low] If `origin/main` is not fetched, the check fails. The guard already requires a `git fetch origin main` before the check, so this is mitigated.