---
title: G1 File Structure
ticket_id: T000913
domains: [infra]
status: active
---

# G1 File Structure Implementation Plan

**Goal:** File Structure lists 4 files but no single task touches more than 2.
The File Structure list must NOT be counted as a phantom task by G1.

## File Structure

- Modify: `scripts/alpha.sh`
- Modify: `scripts/bravo.sh`
- Modify: `scripts/charlie.sh`
- Modify: `scripts/delta.sh`

## Task 1: Touch alpha and bravo

**Files:** `scripts/alpha.sh`, `scripts/bravo.sh`

- [ ] **Step 1: Write the failing test**

```bash
@test "alpha" { run bash scripts/alpha.sh; [ "$status" -eq 0 ]; }
```

Run: `bats tests/unit/alpha.bats`
Expected: FAIL with "command not found"

## Task 2: Touch charlie and delta

**Files:** `scripts/charlie.sh`, `scripts/delta.sh`

- [ ] Implement the change.

## Task 3: Verify

- [ ] **Step 1: Run the full gate**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
