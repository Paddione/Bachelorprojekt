## ADDED Requirements

### Requirement: Validate ignoriert leere Stray-Verzeichnisse

`scripts/openspec.sh validate` SHALL skip directories directly under `changes/` that contain no
entries at all (fully empty), emitting a warning instead of failing the repo-wide gate. A directory
that carries any file or subdirectory remains fully subject to the existing fail-closed checks.

#### Scenario: Empty stray directory does not fail validate

- **GIVEN** a fixture `OPENSPEC_ROOT` with an empty directory `changes/--help/` next to a valid
  change
- **WHEN** `bash scripts/openspec.sh validate` runs against the fixture
- **THEN** the empty directory produces a warning line but the overall result stays `rc=0`
  (`openspec validate: OK`) as long as all real changes pass

### Requirement: Propose verwirft Slugs mit führendem Bindestrich

`scripts/openspec.sh propose` SHALL reject any slug beginning with `-` before creating any
filesystem entry, so that option-like tokens (e.g. `--help`, `-x`) can never materialize as
directories under `changes/`.

#### Scenario: Dash-prefixed slug is rejected without side effects

- **GIVEN** the command `bash scripts/openspec.sh propose --help --ticket T000000`
- **WHEN** the slug `--help` hits the argument guard
- **THEN** the command exits non-zero with an error message and no directory
  `changes/--help/` exists afterwards
