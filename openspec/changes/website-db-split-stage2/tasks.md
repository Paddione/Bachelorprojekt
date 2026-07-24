---
title: "website-db-split-stage2 — Implementation Plan"
ticket_id: T002150
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [T002149]
---

# website-db-split-stage2 — Implementation Plan

_Ticket: T002150_

## File Structure

```
website/src/lib/website-db.ts               (edit: remove Stage-2 functions, add re-exports; builds on merged Stage 1)
website/src/lib/website-db-ops.ts           (new, ~530 lines: Time-Entries/Client-Notes/Onboarding/Follow-ups)
website/src/lib/website-db-admin-ops.ts     (new, ~263 lines: Bug-Ticket-List/Admin-Shortcuts/DSGVO/Invoice-Counter/Brett)
website/src/lib/website-db-content-store.ts (new, ~328 lines: Custom-Sections/Content-Store)
tests/... (extend existing website-db test files as needed, no behavior change)
```

A single `website-db-ops.ts` would land at ~1080 lines (79% over the 600-line unbaselined `.ts` S1
budget) and hard-fail the CI ratchet as a brand-new file, so the second-half extraction is split
across three sibling modules instead of one — still a single `impl` partial (p1), just multiple new
files, all re-exported from `website-db.ts` under their original names.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-extract-stage2-module.md | impl | website/src/lib/website-db.ts, website/src/lib/website-db-ops.ts, website/src/lib/website-db-admin-ops.ts, website/src/lib/website-db-content-store.ts | |
| p2 | tasks.d/p2-tests.md | tests | website/src/lib/website-db.time-entries.test.ts | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
tests/unit/lib/bats-core/bin/bats tests/spec/website-db-split-stage2.bats
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
