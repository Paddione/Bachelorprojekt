---
title: "t002188-dev-flow-plan-fix — Implementation Plan"
ticket_id: T002188
domains: [dev-flow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002188-dev-flow-plan-fix — Implementation Plan

## File Structure

```
.claude/skills/dev-flow-plan/SKILL.md       (changed — fix lock path resolution)
```

## Tasks

### 1. Fix lock path in dev-flow-plan SKILL.md
- Replace `.git/agent-locks/ticket__${TICKET_EXT_ID}.json` with
  `$(git rev-parse --git-common-dir)/agent-locks/ticket__${TICKET_EXT_ID}.json`
- The `--git-common-dir` flag returns `.git` in main checkout and the shared gitdir
  path in worktrees — works everywhere.

### 2. Audit dev-flow-execute for same pattern
- Check `.claude/skills/dev-flow-execute/SKILL.md` for the same relative `.git/agent-locks/`
  pattern and fix if present.
