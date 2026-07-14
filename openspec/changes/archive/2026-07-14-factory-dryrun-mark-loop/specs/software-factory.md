## ADDED Requirements

### Requirement: Dry-run-first tickets graduate to a real run

The Software Factory pipeline SHALL mark a ticket as dry-run-checked
(`ticket.sh dryrun-mark`) after completing its forced preview run in the
`DRY_RUN` branch, so that `guard_dryrun_ok()` permits a real (non-dry-run)
execution on the ticket's next scheduled tick.

#### Scenario: Ticket forced into dry-run by guard_dryrun_ok

- **GIVEN** a ticket has no dry-run-first marker (`ticket.sh dryrun-check`
  exits non-zero)
- **WHEN** the pipeline runs it in the `DRY_RUN` branch and reaches the
  Deploy-phase preview step
- **THEN** it calls `ticket.sh dryrun-mark --id <ticket>` before releasing
  the slot and resetting status to `backlog`, so the next tick's
  `guard_dryrun_ok()` call returns true and the ticket runs for real instead
  of looping through another forced preview.
