---
title: "plan-meta-readiness-merge — Implementation Plan"
ticket_id: T002388
domains: [ticket-system, agentic-tooling]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-meta-readiness-merge — Implementation Plan

_Ticket: T002388 · Spec: [`design.md`](design.md) · Delta: [`specs/ticket-system.md`](specs/ticket-system.md)_

`plan-meta set --readiness k=v` assigns the whole `readiness` JSONB instead of merging into it, so
every call silently drops the keys it did not name — including the dispatch-control flags
`lastenheft_locked`, `factory_excluded` and `execution_released`. This plan changes one SQL line,
adds a read-only audit for the damage already done, and locks both into the spec.

## File Structure

```
scripts/ticket.sh                          (changed — line 763, the readiness assignment)
scripts/vda/ticket/readiness-audit.sh      (new — read-only suspicion report)
scripts/vda/ticket.sh                      (changed — dispatch the new subcommand)
tests/spec/ticket-system.bats              (changed — 8 RED tests, already committed)
openspec/specs/ticket-system.md            (unchanged here — delta merges on archive)
```

**S1 budgets** (effective threshold per `docs/code-quality/gates.yaml`):

| File | Ist | Budget |
|---|---|---|
| `scripts/vda/ticket.sh` | 44 | 456 |

- `scripts/ticket.sh` (990 lines) is on the **S1 ignore list** in `gates.yaml` and carries no
  budget. That is an acknowledged debt, not a licence: this change is line-neutral there (one line
  rewritten in place), and the new report deliberately lives elsewhere rather than growing it
  further.
- `tests/spec/ticket-system.bats` (255 lines) has extension `.bats`, which is ungated by
  `s1.limits` — no budget applies.
- `scripts/vda/ticket/readiness-audit.sh` is new; target under 120 lines against the `.sh` limit
  of 500, leaving room to grow.

<!-- vitest: kein neuer Test nötig, weil dieser Change ausschließlich Shell-Skripte unter scripts/ berührt und keine Datei in website/src/lib/** oder website/src/pages/api/** anlegt oder ändert. -->

## Task 1 — Confirm the RED state

The eight `T002388` tests already sit at the end of `tests/spec/ticket-system.bats` and are
committed with this plan. Re-run them before touching production code, so the later green is
attributable to the fix rather than to a pre-existing pass.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL — 8 of 22 fail (tests 15–22); the 14 pre-existing tests must stay green
```

Should any of the eight already pass, stop and investigate before continuing: a vacuously green
assertion is worse than a missing one. Test 21 needed an explicit `[ -f … ]` gate for exactly this
reason — `grep` against a missing file exits 2 and would satisfy a negative assertion on its own.

## Task 2 — Merge instead of replace in `plan-meta set`

Rewrite the readiness assignment in the `UPDATE` field list of `cmd_plan_meta`
(`scripts/ticket.sh`, currently line 763):

```sql
-- before
readiness         = COALESCE($readiness_sql, readiness),
-- after
readiness         = COALESCE(readiness,'{}'::jsonb) || COALESCE($readiness_sql, '{}'::jsonb),
```

The inner `COALESCE` is load-bearing, not decoration. When `--readiness` is omitted,
`$readiness_sql` expands to the bare literal `NULL`; PostgreSQL's `||` is strict, so
`jsonb || NULL` yields `NULL` and would blank the very column the change exists to protect.
Wrapping it in `COALESCE(…, '{}'::jsonb)` turns that case into a merge with the empty object — a
no-op.

Keep the surrounding `COALESCE(<new>, <column>)` shape for `areas`, `depends_on`, `planning_rank`
and `requirements_list`. Those are scalar columns where "not passed → keep old" is exactly right;
only the JSONB map needed the different treatment. Do **not** add a replacing write path: no
caller wants one, and an unused replace flag would reintroduce the footgun this task removes.

Verify against the first four tests:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats --filter 'T002388: (plan-meta|the replacing|an omitted|every readiness)'
```

No change is needed in `scripts/ticket-mcp/go/internal/tools/planning.go`: both `set_readiness_flag`
(line 105) and `prepare_feature` (line 210) shell into this single code path and are healed by it.

## Task 3 — Add the read-only audit module

Create `scripts/vda/ticket/readiness-audit.sh` following the sourced-module pattern of
`scripts/vda/ticket/stage-plan.sh`: source `_ticket-core.sh`, define `main()`, resolve the pod via
`_pgpod`, query via `_exec_sql`.

Two heuristics, both `SELECT`-only:

1. **Suspiciously narrow** — `jsonb_typeof(readiness) = 'object'` and the object holds exactly one
   key while `status` has advanced beyond `triage`. That is the signature of several sequential
   `set_readiness_flag` calls.
2. **Lock suspicion** — `requirements_list` is non-empty and `readiness` lacks the
   `lastenheft_locked` key **entirely**. Test key absence (`NOT readiness ? 'lastenheft_locked'`),
   never a falsy value: `lastenheft_locked: false` records a deliberate unlock and is not damage.

Report `external_id`, `status`, `type`, the current `readiness` and which heuristic matched.
Support `--brand` like the sibling modules, since the two brand databases are separate.

The module must contain no `UPDATE`, `INSERT` or `DELETE`. The lost keys are not reconstructable —
only the candidate list is, and the decision per ticket belongs to a human. Blanket-restoring
`lastenheft_locked` would open the factory dispatch gate on tickets that were never locked on
purpose, which is a worse failure than the current one.

## Task 4 — Wire the subcommand into the dispatcher

In `scripts/vda/ticket.sh`, add `readiness-audit` to the sourced-subcommand `case` arm alongside
`create|get|update-status|enqueue|stage-plan|triage`, and list it under "Extracted subcommands" in
`show_help()`. Without the dispatcher entry the module would fall through to the `ticket.sh`
pass-through branch and fail with an unknown command — and would count as an S4 orphan script.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats --filter 'T002388: (the readiness-audit module|the ticket dispatcher|the readiness audit never|the lock heuristic)'
```

## Task 5 — Run the audit once and record the finding

Run the new report against both brands and attach the result to the ticket as a comment. This is
the deliverable the report exists for — a list nobody looks at is not a mitigation.

```bash
bash scripts/vda.sh ticket readiness-audit
bash scripts/vda.sh ticket readiness-audit --brand korczewski
```

For any ticket that shows up under the lock heuristic, decide individually whether it belongs back
behind `lastenheft_locked` — via `scripts/ticket.sh lastenheft lock --id <id>`, which now survives
subsequent readiness writes.

## Task 6 — Final Verification

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
task test:changed
task freshness:regenerate
task freshness:check
```

All 22 tests in `tests/spec/ticket-system.bats` must be green, the 14 pre-existing ones included.
`task freshness:regenerate` refreshes `website/src/data/test-inventory.json`, which the CI
inventory check compares against the committed copy — commit it alongside the test changes.
