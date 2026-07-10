---
title: Phrase But No Test Command
ticket_id: T000911
domains: [infra]
status: active
---

# Phrase But No Test Command Implementation Plan

**Goal:** Has the `expected: FAIL` phrase but no real test-runner invocation.

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Claim a failing test without running one

- [ ] **Step 1: Describe a failing test**

The change should make the check fail first.
Expected: FAIL

## Task 2: Verify

- [ ] **Step 1: Run the full gate**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
