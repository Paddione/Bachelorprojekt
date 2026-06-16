---
title: Good Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Good Plan Implementation Plan

**Goal:** Demonstrate a passing plan.

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Do the thing

**Files:**
- Modify: `scripts/example.sh`

- [ ] **Step 1: Write the failing test**

```bash
@test "example" { run bash scripts/example.sh; [ "$status" -eq 0 ]; }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/unit/example.bats`
Expected: FAIL with "command not found"

## Task 2: Verify

- [ ] **Step 1: Run the full gate**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
