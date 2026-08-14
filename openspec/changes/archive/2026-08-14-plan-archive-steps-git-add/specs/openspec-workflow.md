## ADDED Requirements

### Requirement: Archiv-Commit der Referenz staged die SSOT-Delta-Dateien

The archive step reference (`plan-archive-steps.md`) SHALL cover every path
group mutated by `scripts/openspec.sh archive` in its `git add` list before
the archive commit: `openspec/changes/`, `openspec/changes/archive/`,
`openspec/specs/`, and `website/src/data/openspec-status.json`. A regression
guard SHALL check the reference list against these mutation paths, so a
silently unstaged SSOT delta (observed at T002614, repaired in PR #4334)
cannot recur.

#### Scenario: Referenz deckt die SSOT-Delta-Dateien im Archiv-Commit ab

- **GIVEN** a change with a delta spec to be merged into the SSOT
- **WHEN** the archive commit is created following `plan-archive-steps.md`
- **THEN** the `git add` list includes `openspec/specs/` so the merged SSOT
  delta files are part of the commit

#### Scenario: Guard prüft die Referenzliste gegen die Mutationspfade des Archiv-Verbs

- **GIVEN** the regression guard for the archive step reference
- **WHEN** the guard runs against `plan-archive-steps.md`
- **THEN** it verifies that `openspec/specs/` is covered and fails if the
  archive verb mutates a path group the reference does not stage
