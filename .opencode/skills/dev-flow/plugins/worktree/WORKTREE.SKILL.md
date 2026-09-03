# worktree plugins

Worktree management for OpenCode git isolation and temporary workspace creation. Enables feature branching via native git worktrees with automatic cleanup.

## Canonical path

All harnesses (opencode, agy, factory) create worktrees at **`.worktrees/<slug>`** via `scripts/worktree-create.sh`. Config: `.opencode/worktree.jsonc` (`worktreePath: ".worktrees"`).

## Purpose

- Create isolated worktrees for feature/fix branches
- Automatic sync with main branch
- Cleanup after task completion (via `worktree:cleanup`)

## Usage

```bash
# Create a new worktree
worktree:create {
  branch: "feature/my-feature"
}

# ... do work in the worktree ...

# Cleanup when done
worktree:cleanup {
  worktreePath: ".worktrees/feature-my-feature"
}
```

## Architecture

- `createWorktree()` delegates to `scripts/worktree-create.sh` (canonical bash harness)
- `TerminalPlugin` — Manages shell sessions and worktree creation
- State management via `state.ts` (14KB)
- Launch context injection in `launch-context.ts`

---

**Files:**
- `.opencode/skills/dev-flow/worktree.ts` → plugin entry, `createWorktree()` delegation
- `.opencode/skills/dev-flow/plugins/worktree/*.ts` → state, terminal, launch-context
- `.opencode/worktree.jsonc` → config
- `scripts/worktree-create.sh` → canonical bash harness (guards, git-crypt, agent-lock)

**Related:** [dev-flow-execute](.claude/skills/dev-flow-execute/SKILL.md)
