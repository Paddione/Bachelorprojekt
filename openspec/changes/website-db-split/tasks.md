---
title: "website-db-split — Implementation Plan"
ticket_id: T002149
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# website-db-split — Implementation Plan

_Ticket: T002149_

## File Structure

```
website/src/lib/website-db.ts       (edit: remove Stage-1 functions, add re-exports)
website/src/lib/website-db-core.ts  (new: Customer/Bug-Ticket/Site-Settings/Vacation/Legal-Pages)
tests/... (extend existing website-db test files as needed, no behavior change)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-extract-stage1-module.md | impl | website/src/lib/website-db.ts, website/src/lib/website-db-core.ts | |
| p2 | tasks.d/p2-tests.md | tests | website/src/lib/website-db.test.ts | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
tests/unit/lib/bats-core/bin/bats tests/spec/website-db-split.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
