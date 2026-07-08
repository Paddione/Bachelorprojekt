# brain-foundation

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-foundation ergänzen._

## Requirements

### Requirement: REQ-BRAIN-FOUNDATION-001 — Karpathy Seed Structure

The system SHALL seed the brain repository with the Karpathy LLM-wiki layout: a top-level
`SCHEMA.md` (constitution), `index.md` (entry hub), `log.md` (change journal), a `raw/`
directory for unprocessed source captures, and a flat `wiki/` directory holding at least one
example note page and one MOC (map-of-content) hub page. The seed SHALL also include the
per-repo linter scripts under `scripts/` and the CI workflow under `.github/workflows/ci.yml`.

#### Scenario: Fresh seed produces the full Karpathy layout

- **GIVEN** an empty target directory
- **WHEN** the bootstrap seeds the brain structure into it
- **THEN** `SCHEMA.md`, `index.md`, `log.md`, `raw/`, `wiki/`, `scripts/lint-wikilinks.sh`,
  `scripts/lint-frontmatter.sh`, and `.github/workflows/ci.yml` all exist
- **AND** `wiki/` contains at least one note page and one MOC hub page

### Requirement: REQ-BRAIN-FOUNDATION-002 — SCHEMA Conventions Constitution

The `SCHEMA.md` SHALL define the binding conventions for every wiki page: mandatory YAML
frontmatter fields `type` (one of `note`, `moc`, `entity`, `decision`, `runbook`), `tags`, and
`status` (one of `draft`, `active`, `archived`); intra-wiki references as `[[slug]]` wikilinks;
back-references to external sources via `source::` typed edges; the mixed-language convention
(German prose, English technical terms); and the SSOT rule "compile, do not move" — sources stay
in their origin repositories and wiki pages only reference them. Every seeded example page SHALL
itself satisfy these conventions.

#### Scenario: Seeded example pages satisfy the SCHEMA they document

- **GIVEN** the seeded `wiki/` example and MOC pages
- **WHEN** the frontmatter linter runs over the seed
- **THEN** every seeded page carries a valid `type`, non-empty `tags`, and a valid `status`
- **AND** the SSOT rule and `source::` back-reference convention are documented in `SCHEMA.md`

### Requirement: REQ-BRAIN-FOUNDATION-003 — Dead Wikilink Lint

The wikilink linter SHALL scan every Markdown file for `[[slug]]` wikilinks, resolve each slug
against the set of existing page slugs (wiki page basenames plus the top-level `index`, `log`, and
`SCHEMA` pages), and SHALL exit non-zero while reporting every unresolved link. It SHALL run
offline against an arbitrary directory so it is BATS-testable in a temporary directory.

#### Scenario: A dead wikilink fails the lint

- **GIVEN** a Markdown file containing the wikilink `[[ghost]]` with no `ghost` page present
- **WHEN** the wikilink linter runs over the directory
- **THEN** it exits non-zero
- **AND** its output names the dead wikilink `[[ghost]]`

#### Scenario: Only resolvable wikilinks pass

- **GIVEN** a directory where every `[[slug]]` resolves to an existing page
- **WHEN** the wikilink linter runs over the directory
- **THEN** it exits zero

### Requirement: REQ-BRAIN-FOUNDATION-004 — Frontmatter Lint

The frontmatter linter SHALL verify that every wiki Markdown file begins with a YAML frontmatter
block and carries the mandatory fields `type`, `tags`, and `status`, with `type` and `status`
holding an allowed enum value. It SHALL exit non-zero and report the offending file and field for
any missing or invalid field, and SHALL run offline against an arbitrary directory.

#### Scenario: A missing mandatory field fails the lint

- **GIVEN** a Markdown page whose frontmatter omits the `status` field
- **WHEN** the frontmatter linter runs over the directory
- **THEN** it exits non-zero
- **AND** its output reports the missing `status` field for that file

### Requirement: REQ-BRAIN-FOUNDATION-005 — Secret-Scan CI Gate

The seeded brain CI workflow (`.github/workflows/ci.yml`) SHALL run the wikilink linter, the
frontmatter linter, and a secret-scanning step (gitleaks-style) on every push and pull request, so
that the confidentiality guardrail (no credentials, no third-party personal data) is enforced from
day one.

#### Scenario: CI wires all three quality gates

- **GIVEN** the seeded `.github/workflows/ci.yml`
- **WHEN** its steps are inspected
- **THEN** it invokes `scripts/lint-wikilinks.sh`, `scripts/lint-frontmatter.sh`, and a
  secret-scanning action
- **AND** the workflow triggers on both `push` and `pull_request`

### Requirement: REQ-BRAIN-FOUNDATION-006 — Idempotent Local Bootstrap

The bootstrap script SHALL seed the brain structure into a local target directory idempotently:
a second run over an already-seeded directory SHALL exit zero, SHALL NOT error, and SHALL leave
the seeded files intact. The local mode SHALL NOT require any network access so it is BATS-testable.

#### Scenario: Re-running the bootstrap is a no-op that keeps the seed intact

- **GIVEN** a target directory already seeded by a first bootstrap run
- **WHEN** the bootstrap runs a second time over the same directory
- **THEN** it exits zero
- **AND** `SCHEMA.md`, `index.md`, `log.md`, and the `wiki/` example pages are still present

### Requirement: REQ-BRAIN-FOUNDATION-007 — Remote Repo Creation with Parametrized Collaborator

The bootstrap SHALL, in its `--create-remote` mode, create the private GitHub repository via the
`gh-axi` wrapper (with `gh` fallback) and add a collaborator whose GitHub handle is supplied as a
`--collaborator <handle>` parameter. The collaborator handle SHALL NOT be hardcoded in the script.
The remote mode SHALL be separable from the local seed so that offline tests never trigger network
or repo-creation side effects.

#### Scenario: Collaborator handle comes from a parameter, not a literal

- **GIVEN** the bootstrap script source
- **WHEN** it is inspected for the collaborator handle
- **THEN** the handle is read from the `--collaborator` argument
- **AND** no GitHub handle literal is hardcoded in the script

#### Scenario: Local seed mode performs no remote side effects

- **GIVEN** the bootstrap is invoked in local target-directory mode without `--create-remote`
- **WHEN** it runs
- **THEN** it seeds the directory without invoking `gh-axi`/`gh` or any network call

<!-- merged from change delta brain-foundation.md (369ed3945f41) -->

<!-- merged from change delta brain-foundation.md (7b8cca345b3e) -->