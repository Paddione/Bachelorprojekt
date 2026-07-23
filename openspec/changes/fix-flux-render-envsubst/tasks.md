---
title: "fix-flux-render-envsubst — Implementation Plan"
ticket_id: T002127
domains: [infra, security]
status: active
---

# fix-flux-render-envsubst — Implementation Plan

_Ticket: T002127_

## Problem

`scripts/flux-render-artifact.sh` uses dynamic envsubst extraction that is fail-open:
undefined environment variables silently pass through as literal `${VAR}` text in
rendered manifests. This risks secret exposure when manifests with placeholders are
deployed to production.

## File Structure

- `scripts/flux-render-artifact.sh` — add fail-closed guard after envsubst

## Tasks

### Task 1: Add fail-closed post-substitution guard

**File:** `scripts/flux-render-artifact.sh`

Add a grep-based check after the envsubst call that scans the output file for any
remaining `${...}` patterns. If unsubstituted variables are found, the script exits
with status 1 and lists the undefined variables.

The guard is already implemented in the worktree at `scripts/flux-render-artifact.sh`
— verify it compiles and is syntactically valid.

```bash
bash -n scripts/flux-render-artifact.sh
# expected: no output (valid shell syntax)
```

### Task 2: Run quality gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

### Task 3: Commit and stage

```bash
git add -A && git commit -m "fix(infra): make flux-render-artifact.sh fail-closed on undefined envsubst vars [T002127]"
git push -u origin fix/T002127-flux-render-envsubst
bash ../../scripts/ticket.sh stage-plan --id T002127 --branch fix/T002127-flux-render-envsubst --plan openspec/changes/fix-flux-render-envsubst/tasks.md
```
