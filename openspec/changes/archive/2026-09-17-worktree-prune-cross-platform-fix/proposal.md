# Proposal: worktree-prune-cross-platform-fix

## Why

When Git operations run in a heterogeneous workstation environment (Windows Git and WSL Git sharing the repository), `git worktree prune` deletes active worktrees because paths registered in `.git/worktrees/<name>/gitdir` use the host OS syntax (e.g. `C:/Users/...`) which fail resolution under WSL without path conversion.
This deletes the administrative worktree directory, rendering subsequent git operations inside the worktree non-functional (`fatal: not a git repository`) and causing lock reaping routines to discard held claims.

## What

1. **`scripts/lib/worktree-prune-safe.sh`**: A platform-aware wrapper `worktree_prune_safe()` that checks cross-platform candidate paths before pruning, locking surviving worktrees to shield them against `git worktree prune`.
2. **`scripts/worktree-create.sh`**: Automatically locks newly created worktrees (`git worktree lock`), ensuring native protection from `git worktree prune` across all tools.
3. **Call-Site Migration**: Sourced and invoked `worktree_prune_safe` across all repository prune locations.
4. **Automated Verification**: Comprehensive BATS tests in `tests/spec/worktree-cross-platform.bats`.

## Impact

- Affected specs: `agent-skills`
- Affected code: `scripts/lib/worktree-prune-safe.sh`, `scripts/worktree-create.sh`, `scripts/agent-lock-reap.sh`, `scripts/factory/cleanup.sh`, `scripts/factory/watchdog.sh`, `scripts/factory/opencode-exec.sh`, `scripts/factory/dsh-exec.sh`
- New tests: `tests/spec/worktree-cross-platform.bats`

_Ticket: T900046_