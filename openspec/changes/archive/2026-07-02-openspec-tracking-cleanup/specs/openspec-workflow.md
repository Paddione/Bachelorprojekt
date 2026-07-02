## REMOVED Requirements

### Requirement: Archive registriert neue Komponenten automatisch in config.yaml

Removed: the `OpenSpec-Komponenten:` shadow list in `openspec/config.yaml` is
deleted, so there is no config copy left to auto-register into. The
`registerComponent()` mechanism (T001389) and the `checkConfigDrift()` gate
(T001304) it fed are both removed; the `openspec/specs/` directory is the single
source of truth for the component set.

## ADDED Requirements

### Requirement: Verzeichnis openspec/specs/ ist die einzige Komponenten-Quelle

The system SHALL treat the top-level `*.md` files under `openspec/specs/` as the
single source of truth for the component set, and SHALL NOT maintain, read, or
validate any duplicate component enumeration in `openspec/config.yaml`. The
validator (`scripts/openspec-validate.ts`) SHALL derive the component set
exclusively from the directory listing and SHALL perform no config-drift
comparison.

#### Scenario: config.yaml carries no component enumeration

- **GIVEN** the file `openspec/config.yaml`
- **WHEN** the file is inspected
- **THEN** it contains no `OpenSpec-Komponenten:` key
- **AND** `bash scripts/openspec.sh validate` exits 0 without performing a drift check

#### Scenario: validator reads only the directory

- **GIVEN** a well-formed SSOT spec `openspec/specs/<slug>.md`
- **WHEN** `validateTree()` runs against the repo
- **THEN** the spec is validated from the directory listing alone
- **AND** no registration in `openspec/config.yaml` is required for the run to pass

### Requirement: One-off-Specs liegen unter openspec/specs/archive/ und werden nicht als Komponenten validiert

The system SHALL store completed one-off change artifacts (ticket- and
gate-numbered specs) under `openspec/specs/archive/`, and both the validator and
the context loader SHALL treat only top-level `openspec/specs/*.md` files as
component specs, ignoring the `archive/` subdirectory entirely.

#### Scenario: archived spec is ignored by the validator

- **GIVEN** a malformed file `openspec/specs/archive/<slug>.md`
- **WHEN** `validateTree()` / `bash scripts/openspec.sh validate` runs
- **THEN** the archived file is not validated as a component spec
- **AND** the run stays green (exit 0)

#### Scenario: context loader does not fall back to archive

- **GIVEN** a slug whose spec was moved to `openspec/specs/archive/`
- **WHEN** `scripts/openspec-context.sh` is queried for that slug
- **THEN** it follows the existing not-found path
- **AND** it does not load the file from `archive/`

### Requirement: archive --create-new verweigert One-off-Slug-Muster ohne expliziten Override

The system SHALL, when `archive` (via `applyDelta()`) would create a new SSOT
spec whose slug matches the one-off denylist pattern
`^(t[0-9]{6}|g-[a-z0-9]+[0-9]{2})`, fail with a non-zero exit code and an error
message naming `--target-spec <parent>` and `--force-new-component` as
alternatives, unless `--force-new-component` is passed.

#### Scenario: one-off slug is rejected

- **GIVEN** a change whose delta targets a non-existent SSOT `openspec/specs/t000000-foo.md`
- **WHEN** `scripts/openspec.sh archive <slug> --create-new` runs
- **THEN** the command exits with a non-zero status
- **AND** the error message references `--target-spec` and `--force-new-component`
- **AND** no new spec file is written

#### Scenario: --force-new-component overrides the denylist

- **GIVEN** the same change and one-off-shaped target slug
- **WHEN** `scripts/openspec.sh archive <slug> --create-new --force-new-component` runs
- **THEN** the SSOT spec is created
- **AND** the command exits 0

### Requirement: Neu erzeugte SSOT-Stubs tragen einen deutschen Purpose-Platzhalter

The system SHALL, when writing a brand-new SSOT skeleton, emit a German
placeholder Purpose sentence that contains no `TODO` token, so the stub is
recognisable as incomplete without violating the Purpose-must-be-German rule or
tripping the TODO cleanup gate (G-CQ05).

#### Scenario: new skeleton carries a German placeholder purpose

- **GIVEN** `applyDelta()` creates `openspec/specs/<slug>.md` for a genuinely new component
- **WHEN** the skeleton file is written
- **THEN** its `## Purpose` section contains a German placeholder sentence
- **AND** the sentence contains no `TODO` token
