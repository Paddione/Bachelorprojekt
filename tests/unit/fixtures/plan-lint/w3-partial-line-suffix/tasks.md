---
title: "W3 Partial Line Suffix Test Fixture"
ticket_id: T002342
domains: [scripts]
status: active
---

# W3 Partial Line Suffix — Implementation Plan

_Ticket: T002342_

## File Structure

```
CHANGED:
  scripts/register-scope.sh — register named scopes for commitlint
```

## Partials

| # | File | Role | Description | depends_on | min_tier | ctx_tokens |
|---|------|------|-------------|------------|----------|------------|
| 1 | tasks.d/p1-impl.md | impl | Implementation with line-suffix reference | | 27b-local | 32000 |
| 2 | tasks.d/p2-tests.md | tests | Test verification | | 4b-local | 32000 |

## Tasks

### Task 1: Verify partial reference works

**Files:** `scripts/register-scope.sh`

- Verify that the partial tasks.d/p1-impl.md references the file correctly

### Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
