# Proposal: t001352-seed-invoice-counter-conflict

## Why

`seedInvoiceCounter()` in `website/src/lib/website-db.ts` issues
`INSERT ... ON CONFLICT (brand, year) DO NOTHING`, but the `invoice_counters`
table's actual primary key (after `initInvoiceCountersTable()`'s own
migration) is `(brand, year, kind)`. Postgres validates the `ON CONFLICT`
target against existing constraints at parse time, so every call throws
`there is no unique or exclusion constraint matching the ON CONFLICT
specification` — regardless of whether a row actually conflicts. The
function is unusable in its current state.

## What

Correct the `ON CONFLICT` target to `(brand, year, kind)` so it matches the
table's real primary key. `kind` stays implicit `'invoice'` via the column
default — no signature change, no callers to update (the function has no
production callers today, only the test that documents the bug).

_Ticket: T001352_
