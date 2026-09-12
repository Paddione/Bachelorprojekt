---
title: "github-identity-foundation — Implementation Plan"
ticket_id: T900159
domains: [database, ticket-system]
status: active
file_locks:
  - components/website/src/lib/tickets/tables/github-identities.ts
  - components/website/src/lib/tickets-schema.ts
  - components/website/src/lib/tickets/github-reference.ts
  - components/website/src/lib/tickets/github-identity-store.ts
  - components/website/src/lib/tickets/github-reference.test.ts
  - components/website/src/lib/tickets/github-identity-store.test.ts
  - components/website/src/data/test-inventory.json
shared_changes: false
batch_id: null
parent_feature: T900158
depends_on_plans: []
---

# github-identity-foundation — Implementation Plan

_Canonical Issue: I#5588 · Compatibility ticket: T900159 · Design: design.md_

## File Structure

| File | Change | Partial |
| --- | --- | --- |
| `components/website/src/lib/tickets/tables/github-identities.ts` | new normalized GitHub identity tables, indexes, and guards | p1 |
| `components/website/src/lib/tickets-schema.ts` | wire the additive schema module into initialization | p1 |
| `components/website/src/lib/tickets/github-reference.ts` | pure parser and formatter for typed/repository-qualified references | p2 |
| `components/website/src/lib/tickets/github-identity-store.ts` | typed transactional registration, binding, transfer, and correction operations | p2 |
| `components/website/src/lib/tickets/github-reference.test.ts` | parser/formatter unit coverage | p3 |
| `components/website/src/lib/tickets/github-identity-store.test.ts` | schema, uniqueness, correction, transfer, and replay coverage | p3 |
| `components/website/src/data/test-inventory.json` | regenerated test inventory | p3 |

## Partials

| id | File | Role | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | `tasks.d/p1-schema.md` | impl | `components/website/src/lib/tickets/tables/github-identities.ts`, `components/website/src/lib/tickets-schema.ts` | p3 |
| p2 | `tasks.d/p2-reference-store.md` | impl | `components/website/src/lib/tickets/github-reference.ts`, `components/website/src/lib/tickets/github-identity-store.ts` | p1, p3 |
| p3 | `tasks.d/p3-tests.md` | tests | `components/website/src/lib/tickets/github-reference.test.ts`, `components/website/src/lib/tickets/github-identity-store.test.ts`, `components/website/src/data/test-inventory.json` | |

The partials are file-disjoint. Although numbered p3, the tests partial executes
first and owns the explicit RED proof; p1 and then p2 make that same suite GREEN.
This change is additive and contains no production data deletion or GitHub import.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the p3 tests first and run the focused
      Vitest bundle before implementing p1/p2. The run is `expected: FAIL`
      because the schema and identity modules do not exist yet.

```bash
pnpm --dir components/website exec vitest run src/lib/tickets/github-reference.test.ts src/lib/tickets/github-identity-store.test.ts
# expected: FAIL (identity foundation modules and schema are absent)
```

- [ ] **Fix-Step (GREEN).** Implement p1 and p2, then rerun the same focused
      Vitest command until all identity, correction, and idempotency cases pass.

## Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
