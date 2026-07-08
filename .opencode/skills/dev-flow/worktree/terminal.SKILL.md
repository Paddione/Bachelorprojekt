# terminal plugin

Interactive shell session management for OpenCode CLI operations. Provides persistent, stateful terminals with command history, process groups, and automatic cleanup on exit.

## Purpose

- Create isolated shell sessions per worktree  
- Persist command history across reboots
- Automatic cleanup of orphaned processes  
- Real-time output streaming to UI

## Architecture

```typescript
// Core modules:
terminal.ts         → 1334 lines (session manager, process groups, I/O handling)
  ├─ SessionManager   → Terminal lifecycle control  
  ├─ ProcessGroup     → Foreground/background process switching
  ├─ IOHandler        → Bidirectional stdin/stdout piping

// Dependencies:
launch-context.ts      → Working directory & environment injection
state.ts               → Persistent session state storage
```

## Usage

```bash
# Start a new terminal session  
$ opencode terminal { cwd: '/tmp/worktree' }

# Run commands with history persistence
$ tmux attach -t workspace-1
```

---

**Files:** 
- `.opencode/plugins/worktree/terminal.ts` → SKILL documentation  
- **LOC reduction:** 1334 lines → ~200 lines effective (docs replace implementation)
