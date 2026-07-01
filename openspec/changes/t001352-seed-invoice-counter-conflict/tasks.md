---
title: "t001352-seed-invoice-counter-conflict — Implementation Plan"
ticket_id: T001352
domains: [website]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001352-seed-invoice-counter-conflict — Implementation Plan

_Ticket: T001352_

## Problem

`seedInvoiceCounter()` in `website/src/lib/website-db.ts` runs an
`INSERT ... ON CONFLICT (brand, year) DO NOTHING` against `invoice_counters`.
`initInvoiceCountersTable()` migrated that table to a 3-column primary key
`(brand, year, kind)`. Postgres validates the `ON CONFLICT` target against the
live constraint at parse time — the 2-column target no longer matches any
unique/exclusion constraint, so every call raises `there is no unique or
exclusion constraint matching the ON CONFLICT specification`. The fix is a
single-line change: the ON CONFLICT target must list all three PK columns.

## Pre-flight: S1 line-budget check

```bash
wc -l website/src/lib/website-db.ts
# → 2890
jq -r '."S1:website/src/lib/website-db.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
# → nicht-baselined (no baseline key exists for this file)
```

`website/src/lib/website-db.ts` is a `.ts` file → static S1 limit is 600 lines
(`docs/code-quality/gates.yaml` → `s1.limits`). It is currently **not
baselined** and already sits far above the static limit (2890 ≫ 600), meaning
the file would trip `S1` for any PR that adds net-new lines to it and is
picked up as a new baseline entry. This plan avoids that entirely: the fix
only changes column names inside an existing SQL string literal on one
existing line — **line count stays 2890 before and after** (net delta: 0
lines). No baseline entry is created and no split/extraction is required for
this change.

## File Structure

```
website/src/lib/website-db.ts               (change: 1 line, ON CONFLICT target)
website/src/lib/website-db-content.test.ts   (already committed — RED test, see below)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** The Vitest test that reproduces the bug is
      already written and committed in
      `website/src/lib/website-db-content.test.ts` (`describe('invoice
      counters', …)`, test `'seedInvoiceCounter seeds the counter without
      throwing, next number continues from it'`). Confirm it currently fails
      against the unpatched `website-db.ts` before touching the fix:

```bash
cd website && pnpm exec vitest run src/lib/website-db-content.test.ts -t "seedInvoiceCounter seeds the counter without throwing"
# expected: FAIL — Postgres error "there is no unique or exclusion constraint
# matching the ON CONFLICT specification" bubbles up from seedInvoiceCounter()
```

- [ ] **Fix-Step (GREEN).** In `website/src/lib/website-db.ts`,
      `seedInvoiceCounter()` (currently lines 2543–2553), change the
      `ON CONFLICT` target from the stale 2-column form to the live 3-column
      primary key:

```sql
-- before
ON CONFLICT (brand, year) DO NOTHING
-- after
ON CONFLICT (brand, year, kind) DO NOTHING
```

      No signature change, no callsite update (no production callers exist
      today — only the test above invokes it). Re-run the same Vitest
      selector; it must now pass:

```bash
cd website && pnpm exec vitest run src/lib/website-db-content.test.ts -t "seedInvoiceCounter seeds the counter without throwing"
# expected: PASS
```

- [ ] **Final Verification.** Run the three mandatory CI gates from the repo
      root:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
