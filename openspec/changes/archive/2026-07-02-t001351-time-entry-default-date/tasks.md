---
title: "t001351-time-entry-default-date — Implementation Plan"
ticket_id: T001351
domains: [website, db]
status: active
file_locks: ["website/src/lib/website-db.ts"]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001351-time-entry-default-date — Implementation Plan

_Ticket: T001351_

## Context

`createTimeEntry()` in `website/src/lib/website-db.ts` (~line 1581) sends an
explicit `params.entryDate ?? null` value for the `entry_date` column
(`DATE NOT NULL DEFAULT CURRENT_DATE`). Postgres only applies a column
DEFAULT when the column is omitted from the INSERT entirely — an explicit
SQL NULL bypasses the DEFAULT and violates the NOT NULL constraint. When a
caller omits `entryDate` (e.g. an empty date field in the admin time-entry
form, `src/pages/api/admin/zeiterfassung/create.ts`), the INSERT currently
fails outright with a NOT NULL constraint violation, and the admin sees a
generic `Datenbankfehler` redirect.

Full root-cause analysis and rejected alternative (dynamic query builder):
see `docs/superpowers/specs/2026-07-01-t001351-time-entry-default-date-design.md`.

**Dependency note:** T001352 (`seedInvoiceCounter` ON CONFLICT bug) touches
the same file/area (`website`/`db`, likely `website-db.ts`). Do NOT work on
T001352 in parallel with this ticket — start it only after this fix is
merged, to avoid file conflicts on `website-db.ts`.

## File Structure

```
website/src/lib/website-db.ts                       (modified — 1-line fix in createTimeEntry() INSERT query)
website/src/lib/website-db.time-entries.test.ts      (already added — failing regression test, see Task 1)
```

`website/src/lib/website-db.ts` is 2890 lines and is NOT present in
`docs/code-quality/baseline.json` (`nicht-baselined`) — the regular S1 limit
applies, not a baselined-growth budget of 0. This change is a 1-line query
edit with zero net line growth, well within any S1 threshold.

## Tasks

### Task 1: Confirm the failing regression test is RED (already committed)

The failing test `website/src/lib/website-db.time-entries.test.ts` was
already written and committed on this branch during the plan-staging phase
(commit `test(website): add failing test for entry_date DEFAULT bypass
[T001351]`). It asserts that the `INSERT INTO time_entries` query text
contains `COALESCE($8::date, CURRENT_DATE)` for the `entry_date` parameter
slot — a structural assertion that pins down the exact bug (a raw `$8`
placeholder bypasses the column DEFAULT).

Re-run it on the current branch (before implementing the fix) to confirm it
is still RED:

```bash
cd website && npx vitest run src/lib/website-db.time-entries.test.ts
# expected: FAIL — the query currently sends a raw $8 placeholder for
# entry_date, not COALESCE($8::date, CURRENT_DATE)
```

### Task 2: Implement the fix in `createTimeEntry()`

**Target file:** `website/src/lib/website-db.ts`, `createTimeEntry()`
function (~line 1581-1621).

Change the INSERT query's `VALUES` clause from:

```sql
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
```

to:

```sql
VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE))
```

Leave the parameter array unchanged — `params.entryDate ?? null` still
resolves to SQL NULL when `entryDate` is omitted, but the query itself now
falls back to `CURRENT_DATE` server-side instead of relying on the (bypassed)
column DEFAULT. No signature change, no caller change
(`src/pages/api/admin/zeiterfassung/create.ts` already passes
`entryDate: entryDate || undefined` correctly and needs no edit).

Run the regression test again to confirm it now passes:

```bash
cd website && npx vitest run src/lib/website-db.time-entries.test.ts
# expected: PASS — the query now contains COALESCE($8::date, CURRENT_DATE)
```

### Task 3: Sanity-check adjacent behavior is unchanged

Re-read `listTimeEntries()`, `listTimeEntriesInRange()`, and the other
`entry_date`-reading queries in `website-db.ts` (lines ~1623-1760) to confirm
none of them assume the old bypass behavior (they only read `entry_date`,
they don't write it) — no code change expected here, this is a verification
read-through, not a task that touches files. Also spot-check that no other
caller of `createTimeEntry()` besides
`src/pages/api/admin/zeiterfassung/create.ts` exists in the repo
(`grep -rn "createTimeEntry(" website/src`) that might depend on the old
(broken) NULL-insert failure behavior.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `website/src/lib/website-db.time-entries.test.ts`
      was added and committed; it asserts the INSERT query contains
      `COALESCE($8::date, CURRENT_DATE)` for `entry_date`. Confirmed RED on
      the current (pre-fix) branch — see Task 1.

```bash
cd website && npx vitest run src/lib/website-db.time-entries.test.ts
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement Task 2. The test from the previous
      step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates from the repo
      root:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

No new test files are added beyond `website-db.time-entries.test.ts`
(already committed) — `task test:inventory` regeneration is covered by
`task test:changed` / `task freshness:regenerate` picking up the existing
test-inventory diff for this file; commit the regenerated
`website/src/data/test-inventory.json` alongside the fix if it changes.
