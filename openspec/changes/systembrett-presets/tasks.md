---
title: "systembrett-presets — Implementation Plan"
ticket_id: T900360
domains: [brett, templates]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# systembrett-presets — Implementation Plan

_Ticket: T900360 — Systembrett presets: distinct figure configurations loaded on
startup (auto-seed + full staging + reset + migration hygiene). Rationale:
`proposal.md`; decisions D1–D7: `design.md`; contract deltas:
`specs/brett.md`._

## File Structure

```
openspec/changes/systembrett-presets/
  proposal.md, design.md, specs/brett.md, tasks.md, tasks.d/
  tasks.d/p1-migration.md      -> NEW components/brett/src/server/migrations/005_board_templates_full_staging.sql
  tasks.d/p2-seed-extension.md -> components/brett/src/server/figures.ts
  tasks.d/p3-auto-seed.md      -> components/brett/src/server/ws-connection.ts, components/brett/src/server/db.ts
  tasks.d/p4-reset-default.md  -> components/brett/src/types/messages.ts, components/brett/src/server/ws-admin-commands.ts, components/brett/src/server/ws-handler.ts, components/brett/src/client/ui/topbar-share.ts
  tasks.d/p5-tests.md          -> tests/spec/brett.bats, components/website/src/data/test-inventory.json (regenerated)
```

<!-- vitest: kein neuer Test noetig, weil keine Datei unter components/website/src angefasst wird -->

## Partials

| ID | Partial file | Role | Target files | Depends on |
|---|---|---|---|---|
| P1 | `tasks.d/p1-migration.md` | impl | `components/brett/src/server/migrations/005_board_templates_full_staging.sql` |  |
| P2 | `tasks.d/p2-seed-extension.md` | impl | `components/brett/src/server/figures.ts` |  |
| P3 | `tasks.d/p3-auto-seed.md` | impl | `components/brett/src/server/ws-connection.ts`, `components/brett/src/server/db.ts` | P1,P2 |
| P4 | `tasks.d/p4-reset-default.md` | impl | `components/brett/src/types/messages.ts`, `components/brett/src/server/ws-admin-commands.ts`, `components/brett/src/server/ws-handler.ts`, `components/brett/src/client/ui/topbar-share.ts` | P1,P3 |
| P5 | `tasks.d/p5-tests.md` | tests | `tests/spec/brett.bats`, `components/website/src/data/test-inventory.json` | P1,P2,P3,P4 |

No two partials modify the same file. Line budgets per file live in the
partials (measured `wc -l` against baseline/static limit); this index states
no numeric budgets.

## RED phase (failing test first)

- [ ] Run the extended BATS suite before implementing (test blocks owned by
      P5, Task 5.3):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
# expected: FAIL — the new blocks for default marker, auto-seed, full staging, and reset fail on the unimplemented tree
```

## GREEN + final verification

- [ ] Execute P1 through P5 in manifest order, then run the three mandatory
      gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
