## MODIFIED Requirements

### Requirement: Archive merged Delta in SSOT und schiebt Change ins Archiv

The system SHALL accept both `done` and `archived` as terminal ticket states when
`scripts/openspec.sh archive <slug>` verifies the linked ticket in `<change>/.ticket`.
`archived` is a state that follows `done` in the ticket lifecycle, so refusing it would block
the archival of changes whose work is provably finished. Every other ticket state SHALL still
be refused with the existing `archive refused: ticket status is '<state>', expected 'done' or
'archived'` message, and the refusal SHALL exit non-zero before any delta is merged into the
SSOT.

The plan-frontmatter status transition in the archival reference
(`.claude/skills/references/plan-archive-steps.md`, step 7) SHALL cover the `planning` state in
addition to `active`, `plan_staged` and `in_progress`, so that fix plans staged without an
`/opsx:apply` run (whose skeleton status is `planning`) are transitioned to `completed` by the
same `sed` invocation before `ticket.sh archive-plan` persists the plan copy.

#### Scenario: Ein Change mit Ticket-Status `archived` wird archiviert

- **GIVEN** a change directory whose `.ticket` file references a ticket in state `archived`
- **WHEN** `scripts/openspec.sh archive <slug>` is invoked
- **THEN** the command exits 0, merges the delta into the SSOT spec and moves the change
  directory to `openspec/changes/archive/<date>-<slug>/`

#### Scenario: Ein Change mit offenem Ticket wird weiterhin abgewiesen

- **GIVEN** a change directory whose `.ticket` file references a ticket in state `in_progress`
- **WHEN** `scripts/openspec.sh archive <slug>` is invoked
- **THEN** the command exits non-zero, prints a refusal naming the observed state, and leaves
  both the change directory and the SSOT spec untouched

#### Scenario: Fix-Plan im Status `planning` wird vor dem Archiv auf `completed` gesetzt

- **GIVEN** a plan file whose frontmatter carries `status: planning` and an archival run that
  executes step 7 of `plan-archive-steps.md`
- **WHEN** the status transition `sed` from the reference is applied to the plan file
- **THEN** the frontmatter status reads `completed`
