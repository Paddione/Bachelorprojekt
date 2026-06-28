## ADDED Requirements

### Requirement: Merge guard rejects auto-create of new SSOT specs

The OpenSpec delta-merge tool (`scripts/openspec-merge.mjs`) SHALL refuse to
create a new SSOT spec file when the delta target does not exist, unless the
caller explicitly opts in via a `--create-new` flag. This prevents silent
spec proliferation where a delta named after a change-slug spawns a brand-new
SSOT file.

#### Scenario: Missing target without opt-in fails

- **GIVEN** a delta file and an `ssotPath` that does not exist on disk
- **WHEN** `node scripts/openspec-merge.mjs apply <delta> <ssotPath>` runs without `--create-new`
- **THEN** the process exits with code 1 and prints an error pointing the delta at an existing spec or suggesting `--create-new`
- **AND** no new file is written at `ssotPath`

#### Scenario: Missing target with opt-in creates the spec

- **GIVEN** a delta file and an `ssotPath` that does not exist on disk
- **WHEN** `node scripts/openspec-merge.mjs apply <delta> <ssotPath> --create-new` runs
- **THEN** the SSOT file is created and the delta is merged exactly as before the guard existed
- **AND** the process exits with code 0

#### Scenario: Existing target merges unchanged

- **GIVEN** a delta file and an `ssotPath` that already exists
- **WHEN** `node scripts/openspec-merge.mjs apply <delta> <ssotPath>` runs
- **THEN** the delta is merged into the existing SSOT regardless of the `--create-new` flag

### Requirement: Config-drift check is a hard CI gate

The OpenSpec tree validator (`scripts/openspec-validate.ts`) SHALL treat an
SSOT spec under `openspec/specs/` that is not listed in
`openspec/config.yaml` `OpenSpec-Komponenten` as an error, not a warning. An
unlisted spec SHALL cause `validateTree()` to return `ok: false`, failing
`task test:openspec`.

#### Scenario: Unlisted spec fails validation

- **GIVEN** an `openspec/specs/<slug>.md` file whose `<slug>` is absent from `config.yaml` `OpenSpec-Komponenten`
- **WHEN** `validateTree(openspecRoot)` runs
- **THEN** the result has `ok: false`
- **AND** the errors array contains a message naming `<slug>` as not listed in `config.yaml`

#### Scenario: Fully registered tree passes

- **GIVEN** every `openspec/specs/*.md` slug is listed in `config.yaml` `OpenSpec-Komponenten`
- **WHEN** `validateTree(openspecRoot)` runs
- **THEN** the config-drift check contributes no errors

### Requirement: Propose can pre-name a delta after its parent spec

`scripts/openspec.sh propose` SHALL accept an optional `--target-spec <existing-slug>`
flag that names the generated delta file after the parent SSOT spec slug
(`specs/<existing-slug>.md`) instead of the change slug. Without the flag the
existing behaviour (delta named `specs/<change-slug>.md`) is unchanged.

#### Scenario: Propose with target-spec names the delta after the parent

- **GIVEN** an existing SSOT spec slug `admin-cockpit`
- **WHEN** `bash scripts/openspec.sh propose <slug> --ticket <id> --target-spec admin-cockpit` runs
- **THEN** the change directory contains `specs/admin-cockpit.md` (not `specs/<slug>.md`)

#### Scenario: Propose without target-spec is unchanged

- **GIVEN** no `--target-spec` flag
- **WHEN** `bash scripts/openspec.sh propose <slug> --ticket <id>` runs
- **THEN** the change directory contains `specs/<slug>.md` as before

### Requirement: Archive forwards the create-new opt-in

`scripts/openspec.sh archive` SHALL accept and forward a `--create-new` flag to
`scripts/openspec-merge.mjs` so that archiving a genuinely new component can
create its SSOT spec, while the default archive path stays fail-closed against
accidental new-spec creation.

#### Scenario: Archive forwards create-new to the merge tool

- **GIVEN** a change whose delta targets a not-yet-existing SSOT spec for a genuine new component
- **WHEN** `bash scripts/openspec.sh archive <slug> --create-new` runs
- **THEN** the merge tool is invoked with `--create-new` and the SSOT spec is created
