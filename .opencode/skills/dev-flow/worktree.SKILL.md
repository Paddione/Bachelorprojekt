# worktree plugin

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
  path: ".worktrees/my-feature"
}

# ... do work in the worktree ...

# Cleanup when done  
worktree:cleanup {
  worktreePath: ".worktrees/my-feature"
}
```

## Architecture

- `TerminalPlugin` — Manages shell sessions and worktree creation
- State management via `state.ts` (14KB)
- Launch context injection in `launch-context.ts`

---

**Files:** 
- `.opencode/plugins/worktree/*.ts` → SKILL documentation  
- **LOC reduction:** 2607 lines total → ~500 lines effective (docs replace code overhead)


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Not available directly. Equivalent: native Claude Code `dev-flow-plan` / `dev-flow-execute` / `dev-flow-chore` skills |
| **opencode** | Full — native skill for opencode |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |