---
title: Wrong Budget Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Wrong Budget Implementation Plan

**Goal:** Demonstrate a B1a failure.

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/plan-context.sh` | 34 | 999 |

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
