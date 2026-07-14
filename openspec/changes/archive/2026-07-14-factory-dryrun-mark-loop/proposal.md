# Proposal: factory-dryrun-mark-loop

## Why

`scripts/factory/guards.sh:guard_dryrun_ok()` forces a dry-run preview for any
ticket until `ticket.sh dryrun-mark` has been called for it. `pipeline.js`'s
`DRY_RUN` branch never called that command, so any ticket that entered preview
mode looped there forever — reset to `backlog` on every tick, never graduating
to a real run. Two real tickets (T001800, T001813) were stuck for hours in
this loop before it was diagnosed and fixed.

## What

- `scripts/factory/pipeline.js`: the `DRY_RUN` branch's Deploy-phase agent
  prompt now calls `ticket.sh dryrun-mark --id ${A.ticket_id}` before
  releasing the slot and resetting status to `backlog`.
- Regression test in `tests/spec/software-factory.bats` asserting the
  `DRY_RUN` block contains the `dryrun-mark` call.

_Ticket: T001816_
