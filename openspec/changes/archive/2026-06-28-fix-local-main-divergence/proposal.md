## Why

Local `main` repeatedly diverges from `origin/main` with no common ancestor, breaking `git merge-base` and making rebases impossible. The divergence has caused multiple incidents where branches accumulate 800+ unrelated commits and require cherry-pick recovery.

## What Changes

- Add a divergence guard in `scripts/worktree-create.sh` that verifies `git merge-base --is-ancestor origin/main main` before proceeding
- The guard fails fast with a clear error message and the fix command (`git reset --hard origin/main`)

## Capabilities

### New Capabilities
- `divergence-guard`: Pre-worktree divergence check that prevents branch creation on a diverged local main

### Modified Capabilities
- `ci-cd`: The worktree-creation step now includes an automatic divergence check before proceeding

## Impact

- `scripts/worktree-create.sh`: added guard at the top
- No other systems affected — the fix is scoped to a single script