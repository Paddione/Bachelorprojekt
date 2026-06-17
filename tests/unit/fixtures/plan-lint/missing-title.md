---
ticket_id: T000910
domains: [infra]
status: active
---

# Missing Title Implementation Plan

**Goal:** Demonstrate an F1 failure.

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Do the thing

- [ ] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [ ] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
