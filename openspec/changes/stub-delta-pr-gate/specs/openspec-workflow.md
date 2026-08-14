# openspec-workflow Delta — Stub-Delta-PR-Gate

## ADDED Requirements

### Requirement: Stub-Deltas failen den PR-Gate

The change validator (`scripts/openspec-validate.ts`) SHALL report unedited skeleton stubs
in delta specs — a `### Requirement: TODO`, a `#### Scenario: TODO`, or an unexpanded
`The system SHALL …` line — as **errors**, not warnings, so that `validateChange` returns
`ok=false` and the `test:openspec` CI job fails the PR that carries such a delta. A fully
written-out delta SHALL keep validating as `ok=true`.

#### Scenario: Stub-Delta blockiert den Merge

- **GIVEN** a PR whose change delta contains an unedited `### Requirement: TODO` stub
- **WHEN** `validateChange` runs against that change (CI job `test:openspec`)
- **THEN** the result is `ok=false` with an error naming the stub; the PR cannot merge

#### Scenario: Ausformuliertes Delta bleibt grün

- **GIVEN** a change delta with fully written requirements and scenarios (no TODO stubs)
- **WHEN** `validateChange` runs against that change
- **THEN** the result is `ok=true` without stub errors
