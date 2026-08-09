---
title: fa-59-e2e-spec-positive-assertion — Implementation Plan
ticket_id: T002730
domains: [test]
status: active
---

# fa-59-e2e-spec-positive-assertion — Implementation Plan

## File Structure
- `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts` — Ist: 27 Zeilen · Baseline: nicht-baselined · Limit: 900 · **Budget: 873**
- `tests/spec/e2e-testing.bats` — Ist: 70 Zeilen · Baseline: nicht-baselined · Limit: 800 · **Budget: 730**

## Partials
| id | file | role | target_files |
| p1 | tasks.d/p1-fix-e2e-spec.md | impl | tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/e2e-testing.bats |

## Tasks

### Task 1: Verify RED failing BATS test for T002730
- **File**: `tests/spec/e2e-testing.bats`
- **Step**: Run `npx bats tests/spec/e2e-testing.bats` (expected: FAIL before spec fix).

### Task 2: Update E2E spec assertions to explicit positive status 403
- **File**: `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts`
- **Step**: Change `.not.toBe(404)` to `.toBe(403)` and update top comment to document 403 Forbidden status.

### Task 3: Final Verification
- **Step 1**: `task test:changed`
- **Step 2**: `task freshness:regenerate`
- **Step 3**: `task freshness:check`
