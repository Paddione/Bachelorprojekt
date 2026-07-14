---
ticket_id: T001816
plan_ref: openspec/changes/factory-dryrun-mark-loop/tasks.md
---

# factory-dryrun-mark-loop — Design

## Root-Cause

`scripts/factory/guards.sh:guard_dryrun_ok()` forces `dry_run=true` for any ticket
that does not yet carry the "dry-run-first" marker (checked via
`ticket.sh dryrun-check`). The contract, per the guard's own doc comment, is: a
ticket runs once in preview (dry-run) mode, and the pipeline marks it done via
`ticket.sh dryrun-mark` so the *next* tick's `guard_dryrun_ok()` returns true and
the ticket gets a real (non-dry-run) run.

`scripts/factory/pipeline.js`'s `DRY_RUN` branch (Deploy phase, ~lines 579-591)
never calls `dryrun-mark`. It only does:
```js
bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
```
So every ticket that lands in the dry-run branch is *permanently* re-evaluated as
"not yet dry-run-checked" on every subsequent tick — it can never graduate to a
real run. It loops: scout/design/plan (or plan-reuse) preview → reset to backlog
→ picked up again → forced dry-run again → reset to backlog → ...

## Observed Impact (discovered 2026-07-14 while monitoring the factory queue)

- `T001800` and `T001813` sat in `backlog` with zero forward progress despite
  having valid, previously-staged plans (`FACTORY-PLAN-REF` comments, committed
  `openspec/changes/*/tasks.md`, pushed branches).
- `T001800` accumulated **two** separate branches/worktrees from independent
  preview passes because each loop re-derived a slug from scratch instead of
  reusing the existing plan.
- `factory_recent` (last 20 factory comments) showed nothing but repeated
  `scout_drift` warnings across many hours — no phase progress past "plan".

Both tickets were manually unstuck as an operational mitigation (status
corrected to `plan_staged`, `dryrun-mark` set by hand, duplicate branch removed)
while this ticket fixes the underlying code defect so it doesn't recur for the
next ticket that enters the dry-run branch.

## Fix

Add the missing `ticket.sh dryrun-mark` call to the `DRY_RUN` branch in
`scripts/factory/pipeline.js`, before `release-slot`/`update-status`, so the
ticket is recorded as dry-run-checked and `guard_dryrun_ok()` allows a real run
on the next scheduled tick.

## Edge Cases

- The mark must be set even though the ticket is being returned to `backlog` —
  ordering in the prompt string doesn't matter functionally (all three are
  separate shell commands in one agent turn), but the mark call is added first
  for readability (state transition before requeue).
- No other DRY_RUN exit path exists in `pipeline.js` (verified via grep — the
  Deploy-phase branch at ~line 579 is the only `if (DRY_RUN)` block that returns
  early); the plan-lint-fail and conflict-detected early-return paths
  (`scripts/factory/pipeline.js:281`, `:344`) are unrelated — they reset a
  ticket to `backlog` for a *different* reason (blocked/conflict, not preview)
  and are correctly out of scope for this fix.
