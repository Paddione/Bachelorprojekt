## ADDED Requirements

### Requirement: Archive can run without merging a delta into the SSOT

`openspec.sh archive` SHALL support a mode that archives a change without merging its delta into the SSOT spec. In this mode the change directory is moved to the archive destination and the delta is left unmerged, so a change that carries no meaningful spec content (for example a generated mishap bundle whose skeleton delta was never filled in) can be retired without inventing requirements.

Rationale: mishap bundles are process notes, not spec content. 24 of the 51 archive stragglers are `mishap-*` changes whose delta is an unedited skeleton stub (`### Requirement: TODO` / `The system SHALL …`). Forcing an author to invent requirements just to archive a process note is wrong; the correct path is an archive mode that skips the delta merge entirely.

#### Scenario: A mishap bundle archives without a delta merge

- **GIVEN** a change whose delta is an unedited skeleton stub
- **WHEN** `openspec.sh archive <slug> --no-merge` runs
- **THEN** the change directory is moved to the archive destination
- **AND** no delta is merged into the SSOT spec
- **AND** the command exits zero

#### Scenario: The no-merge mode is explicit

- **GIVEN** a change whose delta is an unedited skeleton stub
- **WHEN** `openspec.sh archive <slug>` runs WITHOUT `--no-merge`
- **THEN** the existing fail-closed skeleton-stub guard still aborts the run
- **AND** the change directory is left untouched

### Requirement: Archive guards run before any write to the SSOT

`openspec.sh archive` SHALL run every fail-closed guard (skeleton stub, missing MODIFIED/REMOVED/RENAMED target, refused one-off slug, `--create-new` without a requirement block) before the first write to the SSOT spec. If any guard fails, no SSOT file SHALL have been created or modified and the change directory SHALL remain in place.

Rationale: archiving is not atomic — it merges deltas, moves the directory and regenerates the status map in sequence. If a guard runs after a write, a failed run leaves the SSOT mutated while the change directory is unarchived, a half state that is only repairable by hand. Charge 6 of T002569 left a stray skeleton SSOT (`auto-close-guard.md`) behind for exactly this reason.

#### Scenario: A failing guard leaves the SSOT untouched

- **GIVEN** a change whose delta fails a guard (for example a MODIFIED target that no longer exists in the SSOT)
- **WHEN** `openspec.sh archive <slug>` runs
- **THEN** the command exits non-zero
- **AND** no SSOT spec file is created or modified
- **AND** the change directory is left in place

#### Scenario: A passing run merges and archives atomically

- **GIVEN** a change whose delta passes every guard
- **WHEN** `openspec.sh archive <slug>` runs
- **THEN** the delta is merged into the SSOT spec
- **AND** the change directory is moved to the archive destination
- **AND** the command exits zero
