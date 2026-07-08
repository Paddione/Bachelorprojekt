# worktree plugins

Worktree management for OpenCode git isolation and temporary workspace creation. Enables feature branching via native git worktrees with automatic cleanup.

## Purpose

- Create isolated worktrees for feature/fix branches
- Automatic sync with main branch
- Cleanup after task completion (via `worktree:cleanup`)

## Usage

```bash
# Create a new worktree
worktree:create {
  branch: "feature/my-feature"
  path: "tmp/wt-my-feature"
}

# ... do work in the worktree ...

# Cleanup when done
worktree:cleanup {
  worktreePath: "tmp/wt-my-feature"
}
```

## Architecture

- `TerminalPlugin` — Manages shell sessions and worktree creation
- Persistent state in `.opencode/storage/worktrees/`

---

**Files:** 
- `.opencode/plugins/worktree.ts` (1334 LOC) → SKILL documentation
- `.opencode/plugins/worktree/terminal.ts` (1273 LOC) → moved to skills/dev-flow
