# background-agents

Unified delegation system for OpenCode. Replaces native `task` tool with persistent, async-first agent delegation. All agent outputs are persisted to storage; orchestrator receives only key references.

## Purpose

- Delegate tasks to read-only sub-agents (researcher, explore)
- Automatic persistence of results to `.opencode/storage/`
- Notification-based completion tracking via `<task-notification>` tags
- Read results with `delegation_read(id)` after completion

## Usage

```bash
# Start a delegation
delegate {
  prompt: "Research the agent orchestration workflow"
  agent: "researcher"
}

# Wait for notification, then read result
delegation_read("elegant-blue-tiger")
```

## Architecture

- `DelegationManager` — Core class managing delegation lifecycle
- Persistent storage in `.opencode/storage/<session-id>/`
- Session-based isolation (root sessions group related delegations)

---

**File:** `.opencode/plugins/background-agents.ts`  
**LOC:** 1983 → split into core module + SKILL documentation
