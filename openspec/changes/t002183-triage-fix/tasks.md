---
title: "t002183-triage-fix — Implementation Plan"
ticket_id: T002183
domains: [ticket-mcp]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002183-triage-fix — Implementation Plan

## File Structure

```
scripts/ticket-mcp/go/internal/tools/triage.go   (changed — remove status default, remove debug output)
scripts/ticket-mcp/go/internal/tools/triage_test.go (changed or added — regression test)
```

## Tasks

### 1. Remove status default in triage.go
- Delete the `if status == "" { status = "triage" }` block (lines 46-49)
- Refactor `buildTriageArgs` to conditionally append `--status` only when non-empty

### 2. Remove debug output
- Delete lines 70-72: the `fmt.Fprintf(os.Stderr, ...)` debug block

### 3. Add regression test
- Add a test case to `triage_test.go` that calls `triage_ticket` without `status` and
  verifies the existing status is preserved
