## ADDED Requirements

### Requirement: Archive regenerates and stages every openspec-derived freshness artifact

After moving a change into the archive, `scripts/openspec.sh archive` SHALL regenerate and stage both freshness artifacts derived from `openspec/`: `components/website/src/data/openspec-status.json` (via `openspec-status-map.sh`) and `docs/spec-atlas.md` (via `openspec-atlas.sh`). Staging SHALL happen when `OPENSPEC_ROOT` is unset or points at the repository's own `openspec/` directory, as for the status map today. A failed atlas regeneration SHALL abort the archive run in that mode, as a failed status-map regeneration does.

Rationale: `cmd_archive` regenerated and staged only the status map (T003136, T006371). The spec atlas (T015012) also derives from `openspec/specs` and the archive, so every archive commit reached CI with a stale atlas; PR #5835 failed its freshness gate with "docs/spec-atlas.md regenerated but not staged" and needed a second commit.

#### Scenario: The atlas is current after archiving

- **GIVEN** a repository with a committed spec atlas and an open change whose delta adds a requirement
- **WHEN** `openspec.sh archive <slug>` runs
- **THEN** `docs/spec-atlas.md` equals a fresh `openspec-atlas.sh` run on the resulting tree

#### Scenario: The regenerated atlas is staged

- **GIVEN** the same repository
- **WHEN** `openspec.sh archive <slug>` runs
- **THEN** `docs/spec-atlas.md` is in the index

#### Scenario: The status map is still staged

- **GIVEN** the same repository
- **WHEN** `openspec.sh archive <slug>` runs
- **THEN** `components/website/src/data/openspec-status.json` is in the index
