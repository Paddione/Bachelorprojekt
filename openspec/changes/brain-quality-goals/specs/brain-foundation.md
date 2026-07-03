## ADDED Requirements

### Requirement: REQ-BRAIN-QUALITY-001 — Wikilink lint covers alias and anchor syntax with collected diagnostics

The wikilink linter SHALL, in addition to the plain `[[slug]]` form, recognize the alias form `[[slug|Alias]]` and the anchor form `[[slug#anchor]]`, resolving the slug part (the text before `|` or `#`) against the set of existing page slugs. It SHALL collect every dead wikilink across all scanned files, report each finding individually as `FAIL: <file> dead wikilink: [[<slug>]]`, and exit non-zero only after the full scan instead of stopping at the first finding. It SHALL keep running offline against an arbitrary directory so it stays BATS-testable in a temporary directory.

#### Scenario: A dead alias wikilink fails the lint and names the slug

- **GIVEN** a wiki page containing `[[ghost|Text]]` while no `ghost` page exists
- **WHEN** the wikilink linter runs over the directory
- **THEN** it exits non-zero
- **AND** its output contains `dead wikilink: [[ghost]]`

#### Scenario: A dead anchor wikilink fails the lint and names the slug

- **GIVEN** a wiki page containing `[[ghost#abschnitt]]` while no `ghost` page exists
- **WHEN** the wikilink linter runs over the directory
- **THEN** it exits non-zero
- **AND** its output contains `dead wikilink: [[ghost]]`

#### Scenario: Alias and anchor links to existing pages pass

- **GIVEN** a wiki page linking `[[b|Alias]]` and `[[b#sektion]]` while a page `b` exists
- **WHEN** the wikilink linter runs over the directory
- **THEN** it exits zero

#### Scenario: Every dead link across multiple files is reported before exiting

- **GIVEN** two wiki pages, each containing a different dead wikilink
- **WHEN** the wikilink linter runs over the directory
- **THEN** its output names both dead wikilinks
- **AND** it exits non-zero after the full scan

### Requirement: REQ-BRAIN-QUALITY-002 — Hardened frontmatter lint: scope, non-empty tags, full-run diagnostics

The frontmatter linter SHALL scan exactly the pages under `wiki/` plus the hub pages `index.md`, `log.md`, and `SCHEMA.md` at the repository root; `raw/` and `README.md` SHALL be exempt. It SHALL reject an empty `tags` value (`tags: []` or a bare `tags:` line) with the diagnostic `tags must be a non-empty list`. An invalid enum value (including a case mismatch such as `type: Note`) SHALL produce a FAIL diagnostic naming the file, the field, and the actual value; the linter SHALL continue checking all remaining files and exit non-zero at the end instead of crashing without diagnostics. Existing diagnostic formats for missing fields and invalid enum values SHALL remain unchanged.

#### Scenario: raw/ files without frontmatter pass

- **GIVEN** a file under `raw/` without any frontmatter block
- **WHEN** the frontmatter linter runs over the directory
- **THEN** it exits zero

#### Scenario: README.md without frontmatter passes while hub pages stay in scope

- **GIVEN** a `README.md` without frontmatter and an `index.md` without frontmatter
- **WHEN** the frontmatter linter runs over the directory
- **THEN** `README.md` produces no finding
- **AND** `index.md` is reported for its missing mandatory fields

#### Scenario: An empty tags list is rejected

- **GIVEN** a wiki page whose frontmatter contains `tags: []`
- **WHEN** the frontmatter linter runs over the directory
- **THEN** it exits non-zero
- **AND** its output contains `tags must be a non-empty list`

#### Scenario: An invalid enum value yields a diagnostic and later files are still checked

- **GIVEN** one wiki page with `type: Note` and a second wiki page with `status: bogus`
- **WHEN** the frontmatter linter runs over the directory
- **THEN** its output contains `invalid type: Note` and `invalid status: bogus`
- **AND** it exits non-zero after checking all files

### Requirement: REQ-BRAIN-QUALITY-003 — Lint-gated site build without raw/ publication

The site build workflow template (`.github/workflows/build-site.yml`) SHALL contain a `lint` job that runs both linter scripts, and the build job SHALL declare `needs:` on that lint job so that no site image is built or pushed after a red lint. The content staging of the build job SHALL consist of exactly `index.md`, `log.md`, `SCHEMA.md`, and `wiki` — the `raw/` directory SHALL NOT be staged, so raw material never reaches the published site.

#### Scenario: Build job is gated on the lint job

- **GIVEN** the seeded `.github/workflows/build-site.yml`
- **WHEN** its jobs are inspected
- **THEN** a `lint` job invokes `scripts/lint-wikilinks.sh` and `scripts/lint-frontmatter.sh`
- **AND** the build job declares `needs: lint`

#### Scenario: Staging excludes raw/

- **GIVEN** the seeded `.github/workflows/build-site.yml`
- **WHEN** its content-staging step is inspected
- **THEN** the staged paths are `index.md`, `log.md`, `SCHEMA.md`, and `wiki`
- **AND** the word `raw` does not appear anywhere in the workflow file

### Requirement: REQ-BRAIN-QUALITY-004 — Quality-goals and usage documentation pages in the seed

The brain seed SHALL ship the wiki pages `quality-goals` (type `decision`, listing the eleven goals G-BRAIN01 through G-BRAIN11 with class Gate or Target, the 2026-07-03 baseline, the target value, and one copyable offline measurement command per Target goal, plus a promotion rule from Target to Gate), `usage`, `cheatsheet`, `first-aid`, and `llm-workflows` (all type `runbook`), and a top-level `README.md` landing page without frontmatter. The `llm-workflows` page SHALL contain at least five copyable prompt templates, including an OpenSpec-SSOT sync prompt. The hub pages `index.md` and `wiki/index-moc.md` SHALL link every one of the five new pages, and every seeded page SHALL pass both repaired linters (self-conformity).

#### Scenario: The five documentation pages plus README exist and are linked from both hubs

- **GIVEN** the seeded brain repository
- **WHEN** its files are inspected
- **THEN** `wiki/quality-goals.md`, `wiki/usage.md`, `wiki/cheatsheet.md`, `wiki/first-aid.md`, `wiki/llm-workflows.md`, and `README.md` exist
- **AND** `index.md` and `wiki/index-moc.md` both link each of the five wiki pages

#### Scenario: quality-goals lists all eleven goals with baseline and measurement commands

- **GIVEN** the seeded `wiki/quality-goals.md`
- **WHEN** its content is inspected
- **THEN** it names all goals G-BRAIN01 through G-BRAIN11 with class, baseline dated 2026-07-03, and target
- **AND** each Target goal carries a copyable measurement command that runs offline

#### Scenario: llm-workflows ships at least five prompt templates including OpenSpec-SSOT sync

- **GIVEN** the seeded `wiki/llm-workflows.md`
- **WHEN** its prompt sections are counted
- **THEN** at least five prompt templates are present
- **AND** one of them covers the OpenSpec-SSOT sync workflow

#### Scenario: The full seed passes both repaired linters

- **GIVEN** a freshly bootstrapped brain repository
- **WHEN** both linter scripts run over the seed
- **THEN** both exit zero
