## ADDED Requirements

### Requirement: Orphaned changes are archived by a CI executor without discretionary flags

The repository SHALL provide `scripts/openspec-orphan-archive.sh --slugs <a,b,...> --out <dir> [--dry-run]`, which archives each given slug independently via `openspec.sh archive <slug>` with `TICKET_OFFLINE=1`. It SHALL NOT pass `--allow-shrink`, `--create-new` or `--no-merge`. Each successfully archived slug SHALL be written as one line to `<dir>/archived.txt`; each failed slug SHALL be written to `<dir>/failed.tsv` as `<slug>\t<ticket>\t<reason>`, where the reason is the error line reported by `openspec.sh archive`. A failed slug SHALL NOT stop the remaining slugs. The ticket-done precondition is enforced by the dispatcher that selects the slugs, not by the executor.

Rationale: archiving hung solely on the executing session's `devflow-post-merge-finalize.sh`; on 2026-09-23 all 8 open changes had tickets in status `done`. Half of them needed a human decision (missing SSOT spec, wrong delta header, intended scenario removal), so automation must never take that decision itself.

#### Scenario: A valid change is archived and reported

- **GIVEN** an open change whose delta targets an existing SSOT spec
- **WHEN** `openspec-orphan-archive.sh --slugs <slug> --out <dir>` runs
- **THEN** the change directory is moved into `changes/archive/`
- **AND** `<dir>/archived.txt` contains the slug

#### Scenario: A change needing a discretionary flag is reported, not forced

- **GIVEN** an open change whose delta targets an SSOT spec that does not exist
- **WHEN** the executor runs for that slug
- **THEN** the change directory stays in place and no SSOT spec is created
- **AND** `<dir>/failed.tsv` contains the slug with the reason reported by `openspec.sh archive`

#### Scenario: One failure does not block the other slugs

- **GIVEN** two open changes, one valid and one whose target SSOT spec is missing
- **WHEN** the executor runs for both slugs
- **THEN** the valid change is archived and listed in `archived.txt`
- **AND** the other is listed in `failed.tsv`

#### Scenario: A slug that is not an open change is reported

- **GIVEN** a slug with no directory under `openspec/changes/`
- **WHEN** the executor runs for it
- **THEN** `failed.tsv` lists the slug with the reason `not an open change`

#### Scenario: Dry run writes nothing

- **GIVEN** an open, valid change
- **WHEN** the executor runs with `--dry-run`
- **THEN** its output names the slug
- **AND** the change directory and every SSOT spec are unchanged

### Requirement: A dispatch-only workflow turns executor results into a pull request and issues

The repository SHALL provide `.github/workflows/openspec-orphan-archive.yml`, triggered only by `workflow_dispatch` with a `slugs` input. It SHALL run the executor, and when `archived.txt` is non-empty it SHALL run `task openspec:validate` and `task freshness:regenerate`, commit the result on a new branch and open a pull request with squash auto-merge enabled. For every line of `failed.tsv` it SHALL open a GitHub issue labelled `openspec-orphan` whose title names the slug and ticket, or comment on an already open issue for that slug instead of creating a duplicate. When validation fails after archiving, it SHALL open no pull request and SHALL open one issue naming all slugs of the run.

#### Scenario: Successful slugs arrive as one auto-merge pull request

- **GIVEN** a dispatch whose executor run archived at least one slug
- **WHEN** the workflow finishes
- **THEN** exactly one pull request exists for the run, carrying the archive moves, the SSOT merges and the regenerated freshness artifacts, with auto-merge enabled

#### Scenario: A failed slug is escalated once

- **GIVEN** an open `openspec-orphan` issue for a slug
- **WHEN** a later run fails for the same slug
- **THEN** the existing issue receives a comment and no second issue is opened
