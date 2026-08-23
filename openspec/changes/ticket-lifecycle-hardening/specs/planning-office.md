## ADDED Requirements

### Requirement: Ideas carry an origin marker

`createIdea()` SHALL stamp every idea row at INSERT time with
`readiness->>'origin' = 'idea-generator'`, so ephemeral planning-office ideas are
distinguishable from real dev-flow tickets in `status='planning'`. The marker
SHALL survive readiness merges (`patchItem`) and status transitions.

#### Scenario: Idea insert carries the origin marker

- **GIVEN** a `createIdea()` call with title and brand
- **WHEN** the row is written to `tickets.tickets`
- **THEN** the row's `readiness` contains `"origin": "idea-generator"`
- **AND** the idea still appears in `listOffice()`

### Requirement: cleanupEphemeral deletes only origin-marked ideas

`cleanupEphemeral()` SHALL delete only rows that satisfy ALL of:
`status = 'planning'`, `pinned = false`, AND
`readiness->>'origin' = 'idea-generator'`. It SHALL NOT delete planning rows
without the marker — those are real feature/project tickets from dev-flow
(incident T015005: blind `status='planning'` deletion destroyed ticket T014936).

#### Scenario: Marked unpinned idea is purged

- **GIVEN** an idea created via `createIdea()` that is not pinned
- **WHEN** `cleanupEphemeral()` runs
- **THEN** the idea row is deleted
- **AND** the returned count includes it

#### Scenario: Real planning ticket survives the cleanup

- **GIVEN** a ticket in `status='planning'`, `pinned=false`, WITHOUT the
  `origin='idea-generator'` marker (e.g. created by `ticket.sh`)
- **WHEN** `cleanupEphemeral()` runs
- **THEN** the row still exists
- **AND** the returned count does not include it

#### Scenario: Pinned idea survives the cleanup

- **GIVEN** an idea created via `createIdea()` with `pinned=true`
- **WHEN** `cleanupEphemeral()` runs
- **THEN** the idea row still exists
