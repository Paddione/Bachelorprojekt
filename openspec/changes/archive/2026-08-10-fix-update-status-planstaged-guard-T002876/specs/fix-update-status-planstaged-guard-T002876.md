## ADDED Requirements

### Requirement: update-status verweigert plan_staged ohne Plan-Referenz

The system SHALL reject a transition to `plan_staged` in
`scripts/vda/ticket/update-status.sh` when the ticket has no comment whose body
starts with `FACTORY-PLAN-REF`, printing an error to stderr and exiting non-zero.

#### Scenario: plan_staged ohne Plan-Referenz wird abgewiesen

- **GIVEN** a ticket without any `FACTORY-PLAN-REF` comment
- **WHEN** `update-status.sh --id <ticket> --status plan_staged` is invoked
- **THEN** the command prints an error naming `plan_staged` and the missing plan reference
- **AND** exits non-zero
- **AND** the ticket status remains unchanged

#### Scenario: plan_staged mit Plan-Referenz ist weiterhin erlaubt

- **GIVEN** a ticket with an existing `FACTORY-PLAN-REF` comment
- **WHEN** `update-status.sh --id <ticket> --status plan_staged` is invoked
- **THEN** the status update succeeds (exit 0)
