## ADDED Requirements

### Requirement: Archive refuses an occupied destination

`openspec.sh archive` SHALL refuse to run when the archive destination directory already exists, and SHALL do so BEFORE merging any delta into the SSOT. The refusal message SHALL name the occupied path.

Rationale: the archive step ends in `mv "$dir" "$dest"`. When `$dest` already exists, `mv` moves the source *into* it — producing `changes/archive/<date>-<slug>/<slug>/` silently, with no error. Checking after the merge would leave the delta already applied to the SSOT and the run non-repeatable.

#### Scenario: An existing archive destination blocks the run

- **GIVEN** a change whose archive destination directory already exists
- **WHEN** `openspec.sh archive <slug>` runs
- **THEN** it exits non-zero naming the occupied destination
- **AND** the source change directory is untouched
- **AND** no nested destination-inside-destination directory is created

#### Scenario: A free destination archives normally

- **GIVEN** a change whose archive destination does not exist
- **WHEN** `openspec.sh archive <slug>` runs
- **THEN** the delta is merged into the SSOT spec
- **AND** the source directory is moved to the archive
- **AND** the command exits zero

### Requirement: Half-archived changes are detectable and fail the gate

The repository SHALL provide a check that reports any slug present both under `openspec/changes/<slug>/` and under `openspec/changes/archive/<date>-<slug>/`. The check SHALL exit non-zero when such a slug exists, and SHALL run as part of the fail-closed OpenSpec validation gate.

Rationale: archiving is not atomic — it merges the delta, moves the directory and regenerates the status map in sequence — and its result can be committed only in part. Seven slugs sat in this half state from 2026-07-03 onward, carrying 16 requirements that had shipped but appeared in no SSOT spec. Nothing in CI could observe the condition.

#### Scenario: A slug present in both places fails the check

- **GIVEN** a slug that exists both as an open change and as an archive entry
- **WHEN** the half-archive check runs
- **THEN** it exits non-zero and names the slug together with both paths

#### Scenario: A clean tree passes

- **GIVEN** a tree where every slug is either open or archived, never both
- **WHEN** the check runs
- **THEN** it exits zero

#### Scenario: The check gates OpenSpec validation

- **GIVEN** the OpenSpec validation task
- **WHEN** it runs
- **THEN** the half-archive check runs as part of it, so the condition fails CI rather than accumulating unnoticed
