## ADDED Requirements

### Requirement: MODIFIED delta truncation is detected at merge time

The openspec delta merger SHALL detect when a MODIFIED requirement delta carries fewer
scenarios than the requirement it replaces in the SSOT. A MODIFIED delta is a full
replacement text — a delta that drops scenarios without stating their removal is almost
always an authoring error (observed loss: PR #4440 deleted six scenarios from
`software-factory.md`). The merger SHALL warn on stderr and fail the merge when the
scenario count of a MODIFIED delta is lower than the SSOT requirement's count, unless the
caller passes an explicit `allowShrink` flag for deliberate consolidations. ADDED and
RENAMED operations are unaffected.

#### Scenario: truncating MODIFIED delta fails without allowShrink

- **GIVEN** a MODIFIED delta whose requirement carries fewer scenarios than the SSOT requirement
- **WHEN** `applyDelta` merges it without an allow-shrink flag
- **THEN** the merge fails, a warning naming the requirement and the counts is written to
  stderr, and the SSOT is left unchanged

#### Scenario: complete MODIFIED delta merges normally

- **GIVEN** a MODIFIED delta carrying the full requirement text (all scenarios present)
- **WHEN** `applyDelta` merges it
- **THEN** the merge succeeds and the SSOT requirement is replaced

#### Scenario: allowShrink permits a deliberate consolidation

- **GIVEN** a MODIFIED delta that deliberately reduces the scenario count
- **WHEN** `applyDelta` merges it with the explicit allow-shrink flag
- **THEN** the merge succeeds and the warning is still emitted
