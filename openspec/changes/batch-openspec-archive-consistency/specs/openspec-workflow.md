## ADDED Requirements

### Requirement: Batch-healed archive states stay archived (regression pin)

The repository SHALL keep a regression guard that pins the archive state of the
changes healed by batch T003813 (`agent-lock-scope-regelwerk`,
`fix-systemtest-cronjobs-sdlc-T002644`, `fix-loadout-model-paths-T002886`):
each slug SHALL have an entry under `openspec/changes/archive/` and SHALL NOT
exist as a live change under `openspec/changes/`.

Rationale: all three were stranded in the "change never reached main or in
wrong form" family (T003504: archive commit only on the branch, main kept the
change live; T003510/T003512: delta contradicted the implemented fix). The
healing happened on main via the archive waves T003130 (#4167/#4175) and the
half-archive guards (T002428/T002824); the pin ensures the healed state cannot
regress unnoticed.

#### Scenario: A batch-healed change is archived and not live

- **GIVEN** the repository state after batch T003813 healed the three archive gaps
- **WHEN** the archive-consistency regression guard runs
- **THEN** each of the three slugs has an archive entry under `openspec/changes/archive/`
- **AND** none of them exists as a live change under `openspec/changes/`

#### Scenario: A batch-healed change regresses to a live change

- **GIVEN** a repository state where one of the three batch-healed slugs exists under `openspec/changes/`
- **WHEN** the archive-consistency regression guard runs
- **THEN** the guard fails and names the slug
