---
title: "t002204-worktree-lock — Implementation Plan"
ticket_id: T002204
domains: [devtooling]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002204-worktree-lock — Implementation Plan

## File Structure

```
scripts/worktree-create.sh    (changed — link all workspace node_modules)
scripts/agent-lock.sh         (changed — reap: preserve locks with matching worktree+branch)
```

## Tasks

### 1. worktree-create.sh: link all workspace node_modules
- Parse `pnpm-workspace.yaml` for workspace package directories
- For each workspace package with a `node_modules` in the source checkout, link it
  into the new worktree
- Add a branch-warning if source checkout is on a different branch

### 2. agent-lock.sh reap: worktree-based lock preservation
- In `cmd_reap` / `_reapable`: before marking a lock as stale, check if the lock's
  `worktree` path exists AND `git rev-parse --abbrev-ref HEAD` inside that worktree
  matches the lock's `branch` field
- If both match, keep the lock alive (treat it as live despite SID mismatch)
