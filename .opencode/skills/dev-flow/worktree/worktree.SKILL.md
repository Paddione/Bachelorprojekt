# worktree plugin (worktree.ts)

Git worktree lifecycle management for OpenCode. Enables isolated development environments with automatic sync to main branch and cleanup on task completion.

## Purpose

- Create git worktrees for feature branches  
- Automatic `git fetch && rebase` on startup
- Persistent working directories in `.opencode/`
- Cleanup orphaned worktrees after session end

## Architecture

```typescript
// Core modules:
worktree.ts         → 1215 lines (lifecycle manager, sync orchestration)
  ├─ LifecycleManager   → Worktree creation/deletion  
  ├─ SyncCoordinator    → Automatic rebase & conflict resolution
  └─ CleanupScheduler   → Periodic orphan detection

// Dependencies:
TerminalPlugin      → Shell session management for git commands
launch-context.ts     → Working directory injection
```

## Usage

```bash
# Create a new worktree
worktree:create {
  branch: "feature/my-feature"  
  path: "tmp/wt-my-feature"
}
```

---

**Files:** 
- `.opencode/plugins/worktree.ts` → SKILL documentation  
- **LOC reduction:** 1215 lines → ~200 lines effective (docs replace implementation)
