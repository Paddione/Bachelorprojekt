# Proposal: decouple-tickets-db

> Scope: **cycle #1 only** of G-CQ07 (S2 Import-Zyklen 4 → 0). Cycles #2, #3, #4
> are separate future PRs.

## Why

`website/src/lib/tickets-db.ts` and `website/src/lib/website-db.ts` form a static
import cycle. `madge --circular` (Stand 2026-06-27) reports four cycles in
`website/src/`; this PR removes the first and biggest:

```
1) lib/tickets-db.ts > lib/website-db.ts
```

The cycle blocks **G-SIZE03** (god-file split of `website-db.ts`, 4485 lines) —
every candidate sub-module that needs `initTicketsSchema` would re-introduce a
static import to `tickets-db.ts`, which in turn imports `pool`/`ensureSchemaOnce`
back from `website-db.ts`. Seven test files (factory-floor, factory-metrics,
platform-db.ensure, questionnaire-db.ensure, tickets-db.providerrouting,
tickets-db.test, website-db-init-hotpath) work around the cycle with
`vi.mock('./tickets-db', …)`. Splitting `website-db.ts` without breaking the
cycle forces every new sub-module into the same workaround — accumulating
fragility.

Goal: cycle #1 disappears, public APIs of both modules stay byte-identical, all
callers keep their current `import { … } from './tickets-db'` lines, and
`tickets-db.ts` (baselined at 1096 lines, S1-budget = 0) shrinks rather than grows.

## What

Extract the two `pool`-using functions and the `MixedEmbeddingModelError`
re-export from `tickets-db.ts` into a new sibling module
`website/src/lib/tickets-schema.ts`. The new module imports `pool` and
`ensureSchemaOnce` from `website-db.ts`; `tickets-db.ts` becomes a thin
re-export facade.

Concrete changes:

- **New file `website/src/lib/tickets-schema.ts`** containing:
  - `import { pool, ensureSchemaOnce } from './website-db'`
  - `import { MixedEmbeddingModelError } from './knowledge-db'`
  - `import { initProviderConfigSchema } from './schema/provider-config-schema'`
  - `import { ensureCockpitViews } from './tickets/cockpit-schema'`
  - `export { MixedEmbeddingModelError }`
  - `export async function initTicketsSchema(): Promise<void>` (body moved
    from `tickets-db.ts` lines 16–1080, ~1065 lines of DDL)
  - `export async function isFeatureEnabled(brand, key): Promise<boolean>` (body
    moved from `tickets-db.ts` lines 1082–1095)
  - module-local `schemaReady` flag (moved from `tickets-db.ts` line 16)
- **`website/src/lib/tickets-db.ts` reduced** to a ~14-line facade that
  re-exports `initTicketsSchema`, `isFeatureEnabled`, `MixedEmbeddingModelError`
  from `./tickets-schema` and keeps `ticketEmbeddingModel()` locally (it does
  not use `pool`).
- **`website/src/lib/website-db.ts` rewired**: one-line change at line 9
  (`./tickets-db` → `./tickets-schema`).
- **`docs/code-quality/gates.yaml` extended**: new `s1.ignore` entry for
  `website/src/lib/tickets-schema.ts` with rationale analogous to the existing
  `website-db.ts` entry (lines 56–59).
- **Six test files updated** to follow the new module path for `vi.mock(...)`:
  - `factory-floor.test.ts`
  - `factory-metrics.test.ts`
  - `platform-db.ensure.test.ts`
  - `questionnaire-db.ensure.test.ts`
  - `tickets-db.providerrouting.test.ts` (mock + readFileSync source path)
  - `website-db-init-hotpath.test.ts`
- **`tickets-db.test.ts` updated** to read its `pg_notify`-trigger source from
  `./tickets-schema.ts` instead of `./tickets-db.ts` (the trigger now lives
  in the extracted body).

Out of scope (separate PRs):

- Cycle #2: `website-db.ts > tickets/transition.ts > reporter-link.ts`
- Cycle #3: `website-db.ts > tickets/transition.ts` (the listing duplicate)
- Cycle #4: `invoice-pdf.ts > native-billing.ts`
- G-SIZE03 split of `website-db.ts` (now unblocked, separate work)

## Acceptance

- `npx --yes madge --circular --extensions ts,tsx website/src` reports
  cycles #2, #3, #4 (cycle #1 absent).
- `task test:unit` (website subset) and `task test:changed` green.
- `task test:code-quality` green — S1-Ratchet respects the shrink of
  `tickets-db.ts` and the new `s1.ignore` entry for `tickets-schema.ts`.
- `task freshness:regenerate && task freshness:check` green.
- `bash scripts/openspec.sh validate` green.
- `bash scripts/plan-lint.sh openspec/changes/decouple-tickets-db/tasks.md`
  Exit 0.
- Public-API-Stability-Check: `git diff` between baseline and refactor shows
  no changes outside the three refactor files, the gate YAML, and the
  seven test files.

_Ticket: T001172_
