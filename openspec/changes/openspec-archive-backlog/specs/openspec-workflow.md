# Spec Delta: openspec-workflow

## MODIFIED Requirements

### Requirement: Archive merged Delta in SSOT und schiebt Change ins Archiv

The system SHALL accept both `done` and `archived` as terminal ticket states when
`scripts/openspec.sh archive <slug>` verifies the linked ticket in `<change>/.ticket`.
`archived` is a state that follows `done` in the ticket lifecycle, so refusing it would block
the archival of changes whose work is provably finished. Every other ticket state SHALL still
be refused with the existing `archive refused: ticket status is '<state>', expected 'done' or
'archived'` message, and the refusal SHALL exit non-zero before any delta is merged into the
SSOT.

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

## ADDED Requirements

### Requirement: Vollzugsrückstau wird chargenweise gegen ein eingefrorenes Manifest abgebaut

The system SHALL treat a bulk archival of accumulated changes as a sequence of independently
reviewable pull requests driven by a frozen manifest file, not as a single sweep. The manifest
SHALL name, per change, its batch number, the linked ticket, the observed ticket state at
measuring time, the target SSOT spec and whether `--create-new` applies. Batch membership SHALL
NOT be recomputed at execution time, because `openspec/changes/` keeps growing while the
sequence runs and a recomputed set would silently change scope between batches.

#### Scenario: Eine Charge wird gegen das eingefrorene Manifest ausgeführt

- **GIVEN** a frozen manifest listing 139 changes across 7 batches
- **WHEN** batch 3 is executed
- **THEN** exactly the changes whose manifest batch column is `3` are archived, and changes that
  appeared in `openspec/changes/` after the manifest was frozen are left untouched

### Requirement: Ein Scenario-Guard-Bruch beim Archivieren isoliert nur den Verursacher

The system SHALL validate the OpenSpec tree after archiving a batch and before committing it.
When `task openspec:validate` reports a missing `#### Scenario:` block in a merged SSOT spec,
only the single change whose delta caused the break SHALL be rolled back; the remaining changes
of the batch SHALL still ship. A rolled-back change SHALL be recorded as a straggler with its
failing spec name, so it can be repaired in a dedicated pull request instead of blocking the
sequence.

#### Scenario: Eine Charge enthält ein Delta ohne Scenario-Block

- **GIVEN** a batch of 20 changes of which one merges a requirement without a `#### Scenario:`
  block into its SSOT spec
- **WHEN** the batch is archived and `task openspec:validate` is run before committing
- **THEN** validation fails naming the offending spec, that one change is restored to
  `openspec/changes/` via `git checkout`, its SSOT spec is restored to the pre-merge state, and
  the other 19 changes are committed and shipped
