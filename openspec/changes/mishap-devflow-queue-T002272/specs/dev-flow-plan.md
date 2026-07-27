## ADDED Requirements

### Requirement: REQ-DFP-HOLD-001 — stage-plan supports an explicit hold for interactive planning sessions

`scripts/vda/ticket/stage-plan.sh` SHALL accept an optional `--hold` flag. When present,
it SHALL (a) set `readiness->>'execution_released' = 'false'` on the ticket in the same
transaction as the `plan_staged` status update, and (b) skip the `force-tick-requested`
control-flag write and the best-effort `systemctl --user start factory.service` call —
there is no reason to wake the autonomous factory for a ticket a human explicitly wants
to keep to themselves. Without `--hold`, behavior SHALL be byte-identical to before
T002272 (force-tick requested, `execution_released` left unset).

`dev-flow-plan` SKILL.md Step 4.5 SHALL pass `--hold` on every interactive
`stage-plan` call — this is the only caller this requirement changes; automated
callers (e.g. mishap-tracker auto-plans) keep calling `stage-plan` without `--hold` and
are unaffected.

### Requirement: REQ-DFP-HOLD-002 — release-hold hands the ticket to the factory explicitly

`ticket.sh` SHALL provide a `release-hold --id <ext-id>` subcommand that sets
`readiness->>'execution_released' = 'true'` and re-requests a `force-tick-requested`
control-flag write (mirroring the wake logic `stage-plan` skips under `--hold`) so a
released ticket is picked up promptly rather than waiting for the next `factory.timer`
tick. `dev-flow-execute` SKILL.md SHALL call `release-hold` as its opening step, making
the human decision to move from planning to execution an explicit, auditable action
instead of an implicit consequence of lock timing.

#### Scenario: stage-plan --hold sets the flag and skips the wake

- **GIVEN** a plan committed and pushed on a feature branch
- **WHEN** `stage-plan --id T… --branch … --plan … --partials N --hold` completes
- **THEN** the ticket's `readiness->>'execution_released'` is `'false'`
- **AND** `tickets.factory_control` does NOT gain a new `force-tick-requested` row from
  this call
- **AND** `factory.service` is not started by this call

#### Scenario: stage-plan without --hold is unchanged

- **GIVEN** a plan committed and pushed on a feature branch
- **WHEN** `stage-plan --id T… --branch … --plan … --partials N` completes (no `--hold`)
- **THEN** the ticket's `readiness` has no `execution_released` key
- **AND** the existing `force-tick-requested` write and `factory.service` start still
  happen exactly as before T002272

#### Scenario: release-hold flips the flag and re-wakes the factory

- **GIVEN** a ticket held via `stage-plan --hold`
- **WHEN** `ticket.sh release-hold --id <ext-id>` runs
- **THEN** `readiness->>'execution_released'` becomes `'true'`
- **AND** a fresh `force-tick-requested` row is written for the ticket's brand
