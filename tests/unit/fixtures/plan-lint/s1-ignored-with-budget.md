---
title: S1 Ignored File With Claimed Budget Plan
ticket_id: T002270
domains: [infra]
status: active
---

# S1 Ignored File With Claimed Budget Implementation Plan

**Goal:** Identical to `s1-ignored-file.md`, but the File Structure table states a
numeric budget for the ignored file instead of `n/a`. The S1 gate does not measure
this file, so the number is meaningless — plan-lint SHALL warn `W4` naming the file
without failing the run (T002270).

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/ticket.sh` | 866 | -366 |

## Task 1: Edit

- [ ] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [ ] **Step 2: Run to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [ ] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
