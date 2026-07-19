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

### Requirement: REQ-BRAIN-FOUNDATION-008 — Glob-Based SSOT Spec Coverage

The ingest manifest (`scripts/brain/ingest-sources.yaml`) SHALL declare the `ssot-specs` group as the
glob `openspec/specs/*.md` rather than a static, hand-maintained list of individual file paths, so that
every current and future OpenSpec SSOT capability spec is automatically eligible for brain ingestion
without a manual manifest edit. The existing `openspec/specs/archive/` exclude prefix SHALL continue to
suppress archived specs from the glob's matches.

#### Scenario: A newly created SSOT spec is covered without a manifest change

- **GIVEN** the `ssot-specs` group is declared as `openspec/specs/*.md`
- **WHEN** a new capability spec file is added under `openspec/specs/`
- **THEN** the worklist generator includes it in the `ssot-specs` group on the very next run
- **AND** no edit to `scripts/brain/ingest-sources.yaml` was required

#### Scenario: Archived specs remain excluded

- **GIVEN** the `ssot-specs` group is declared as `openspec/specs/*.md`
- **WHEN** the worklist generator walks `openspec/specs/archive/`
- **THEN** files under `openspec/specs/archive/` are excluded from the worklist

### Requirement: REQ-BRAIN-FOUNDATION-009 — Fail-Loud Manifest Drift Detection

`scripts/brain-ingest-worklist.sh` SHALL detect when a manifest-declared group matches zero source
files anywhere under the walked root and SHALL report each such group by name on stderr as a drift
warning, while the process's exit code SHALL remain `0` so that partial/filtered ingest runs are not
blocked by the diagnostic. The `find`-based directory walk SHALL additionally prune any `.worktrees/`
subtree so that nested worktree checkouts of the repository never produce duplicate worklist entries.

#### Scenario: A manifest group with zero matches is reported, not silently dropped

- **GIVEN** a manifest declaring a group whose glob pattern matches no file under the walked root
- **WHEN** the worklist generator runs
- **THEN** it exits `0`
- **AND** it prints a warning on stderr naming the zero-match group

#### Scenario: A group with real matches produces no drift warning

- **GIVEN** a manifest declaring a group whose glob pattern matches at least one file under the walked
  root
- **WHEN** the worklist generator runs
- **THEN** it prints no drift warning for that group

#### Scenario: A .worktrees/ subtree is pruned from the walk

- **GIVEN** a `.worktrees/` directory containing a nested full checkout of the repository under the
  walked root
- **WHEN** the worklist generator runs
- **THEN** no file under `.worktrees/` appears in the emitted worklist

### Requirement: REQ-BRAIN-FOUNDATION-010 — Diagram Group and Mermaid Preservation

The ingest manifest SHALL declare a `diagrams` group (type `note`, tags `[diagram, architecture]`)
covering `docs/diagrams/*.md` and `docs/db-schema-diagram.md`. The generated architecture page
(`docs/diagrams/architecture.md`, produced by `scripts/build-graph-docs.mjs` from
`docs/generated/graph.json` and `docs/generated/api-map.json`) SHALL be pure Markdown containing fenced
` ```mermaid ` diagram blocks and a Markdown API table — it SHALL NOT contain inline HTML, CSS, or a
CDN-loaded Mermaid script, and its content SHALL be deterministic (byte-identical across consecutive
regenerations given unchanged input JSON, i.e. it SHALL NOT embed a live generation timestamp). The
LLM ingest transform prompt (`scripts/brain-ingest-transform.sh`) SHALL instruct the model to preserve
` ```mermaid ` code blocks verbatim rather than distilling them into prose.

#### Scenario: The architecture page is Mermaid-Markdown, not HTML

- **GIVEN** `docs/generated/graph.json` and `docs/generated/api-map.json` exist
- **WHEN** `scripts/build-graph-docs.mjs` runs
- **THEN** it writes `docs/diagrams/architecture.md`
- **AND** the file contains a ` ```mermaid ` fenced block
- **AND** the file contains neither `<html` nor a reference to a CDN Mermaid script

#### Scenario: The architecture page is deterministic across regenerations

- **GIVEN** unchanged `docs/generated/graph.json` and `docs/generated/api-map.json` content
- **WHEN** `scripts/build-graph-docs.mjs` runs twice in succession
- **THEN** the two resulting `docs/diagrams/architecture.md` files are byte-identical

#### Scenario: The transform prompt preserves mermaid blocks verbatim

- **GIVEN** the LLM ingest transform prompt in `scripts/brain-ingest-transform.sh`
- **WHEN** its rule list is inspected
- **THEN** it explicitly instructs the model to keep ` ```mermaid ` code blocks verbatim

### Requirement: REQ-BRAIN-FOUNDATION-011 — Health-Goals Ingest Group

The ingest manifest SHALL declare a `health-goals` group (type `decision`, tags `[health, goals]`)
targeting `.claude/lib/goals.md`, and the Phase-2b MOC-generation loop in `scripts/brain-ingest.sh`
SHALL include both the `health-goals` and `diagrams` groups alongside its existing six groups, so that
every declared manifest group without a bespoke per-group MOC template still gets a sub-MOC page
generated by the shared, group-agnostic loop.

#### Scenario: goals.md is a declared, typed ingest source

- **GIVEN** the ingest manifest
- **WHEN** it is inspected
- **THEN** a `health-goals` group targets `.claude/lib/goals.md` with default type `decision`

#### Scenario: The Phase-2b MOC loop covers the new groups

- **GIVEN** `scripts/brain-ingest.sh`'s Phase-2b group loop
- **WHEN** its group name list is inspected
- **THEN** it includes both `health-goals` and `diagrams` alongside the original six groups

### Requirement: REQ-BRAIN-FOUNDATION-012 — Merge-Hook Path Parity

`.github/workflows/brain-merge-hook.yml` SHALL process every path it declares as a push trigger — in
particular, `docs/adr/**` SHALL have a corresponding merge-hook invocation (not just a trigger
declaration), and `.claude/lib/goals.md`, `docs/diagrams/**`, and `docs/db-schema-diagram.md` SHALL be
declared as triggers with corresponding merge-hook invocations. `scripts/brain-merge-hook.sh` SHALL
support a single regular file as its `SRC` argument (copying it directly to `DEST/<basename>`), not
only a directory tree.

#### Scenario: A declared ADR trigger has a matching handler

- **GIVEN** `.github/workflows/brain-merge-hook.yml`
- **WHEN** its trigger paths and merge-hook invocation steps are compared
- **THEN** `docs/adr/**` appears as both a trigger path and a processed source

#### Scenario: goals.md and diagram sources are wired end-to-end

- **GIVEN** `.github/workflows/brain-merge-hook.yml`
- **WHEN** its trigger paths and merge-hook invocation steps are inspected
- **THEN** `.claude/lib/goals.md`, `docs/diagrams/**`, and `docs/db-schema-diagram.md` each appear as
  both a trigger path and a processed source

#### Scenario: A single-file SRC is copied to DEST by basename

- **GIVEN** a `SRC` argument that is a path to a single regular file
- **WHEN** `scripts/brain-merge-hook.sh` runs
- **THEN** the file is copied to `DEST/<basename of SRC>`

<!-- merged from change delta brain-foundation.md (1729644ca8da) -->

### Requirement: REQ-BRAIN-FOUNDATION-013 — Prune-Phase (Deletion-Sync)

Die Ingest-Pipeline SOLL eine Prune-Phase besitzen (`scripts/brain-ingest-prune.sh`,
aufrufbar standalone und als Phase 2c aus `scripts/brain-ingest.sh` via `--prune`-Flag),
die Wiki-Seiten im brain-Repo als Löschkandidaten ermittelt, wenn (a) ihre
`source:: Bachelorprojekt <pfad>`-Rückreferenz auf eine nicht mehr existierende Datei zeigt
UND der Pfad nicht in der aktuellen Manifest-Worklist steht, ODER (b) die Seite keine
Bachelorprojekt-`source::`-Zeile trägt, aber ein State-File-Eintrag
(`~/.brain-ingest-state.json`, Quellpfad→Slug) auf sie zeigt, dessen Quellpfad nicht mehr
existiert. Meta-Seiten (source `self` oder ohne Bachelorprojekt-Präfix und ohne
State-Eintrag) DÜRFEN NIEMALS gelöscht werden. Der Default-Lauf listet Kandidaten nur
(dry); erst das `--prune`-Flag löscht scharf und bereinigt die zugehörigen
State-File-Einträge mit. Die Prune-Phase MUSS gegen die volle (nicht Pilot-gekürzte)
Worklist arbeiten und idempotent sein (zweiter Dry-Lauf nach scharfem Prune zeigt 0
Kandidaten).

#### Scenario: A stale source:: page is listed as candidate but not deleted by default

- **GIVEN** a wiki page whose `source:: Bachelorprojekt <path>` points to a file that no
  longer exists and whose path is absent from the current worklist
- **WHEN** the prune script runs without `--prune`
- **THEN** it exits zero and prints a `PRUNE-CANDIDATE:` line naming the page
- **AND** the page file still exists afterwards

#### Scenario: --prune deletes candidates and cleans their state entries

- **GIVEN** the same stale page and a state file entry mapping the vanished source path to
  its slug
- **WHEN** the prune script runs with `--prune`
- **THEN** the wiki page file is deleted
- **AND** the state file no longer contains the entry for the vanished source path

#### Scenario: A page without source:: is resolved via the state reverse map

- **GIVEN** a wiki page carrying no `source:: Bachelorprojekt` line, but a state file entry
  whose `slug` matches the page and whose source path no longer exists
- **WHEN** the prune script runs
- **THEN** the page is reported as a `PRUNE-CANDIDATE:`

#### Scenario: Meta pages are never deleted

- **GIVEN** a wiki page with `source:: self` (or no source:: line) and no matching state
  file entry
- **WHEN** the prune script runs with `--prune`
- **THEN** the page file still exists afterwards
- **AND** it never appears in the `PRUNE-CANDIDATE:` output

### Requirement: REQ-BRAIN-FOUNDATION-014 — Fail-Closed Transform-Output-Validierung

`scripts/brain-ingest-transform.sh` SOLL seinen LLM-Output fail-closed validieren: eine
`source::`-Zeile ist Pflicht, und der Body (nach dem Frontmatter-Block) MUSS mindestens
einen `[[`-Wikilink enthalten. Bei einem Verstoß erfolgt genau EIN Retry, dessen Prompt um
einen expliziten Fehlerhinweis (source::-Pflicht + Wikilink-Pflicht) ergänzt wird; schlägt
auch der Retry fehl, beendet sich das Skript mit Exit-Code 1 (zählt als Ingest-Fehlschlag,
kein stilles Durchwinken). Die Prompt-Sprachregel SOLL Mischübersetzungen verbieten
(durchgängig deutsche Prosa ODER englische Original-Passagen unverändert belassen), und der
Request SOLL `max_tokens: 3072` verwenden (statt 2048), bei unveränderter Temperatur 0.2.

#### Scenario: Output without source:: fails after exactly one retry

- **GIVEN** an LLM endpoint that always returns a page body without a `source::` line
- **WHEN** the transform script runs against it
- **THEN** it issues exactly two requests (initial attempt plus one retry)
- **AND** it exits non-zero reporting the missing `source::` line

#### Scenario: A valid output passes on the first attempt

- **GIVEN** an LLM endpoint returning a page with a `source::` line and at least one
  `[[wikilink]]` in the body
- **WHEN** the transform script runs against it
- **THEN** it exits zero after a single request
- **AND** its stdout contains the `source::` line

#### Scenario: The request carries the raised token budget and the language rule

- **GIVEN** the transform script source
- **WHEN** its request payload and prompt rules are inspected
- **THEN** the payload declares `max_tokens: 3072`
- **AND** the prompt forbids word-for-word mixed translation (Mischübersetzung)

### Requirement: REQ-BRAIN-FOUNDATION-015 — source::-Pflicht im brain-Repo-Lint

Der Frontmatter-Linter des brain-Repos (`scripts/lint-frontmatter.sh` in `Paddione/brain`)
SOLL zusätzlich prüfen, dass jede `wiki/*.md`-Seite eine `source::`-Rückreferenz trägt, und
bei Verstoß mit Exit-Code ungleich Null die betroffene Datei melden. Ergänzend SOLL ein
advisory Orphan-Audit-Skript Seiten ohne eingehenden MOC-Link auflisten, ohne die CI zu
blockieren (Exit 0 — keine neuen harten Gates über die source::-Pflicht hinaus).

#### Scenario: A wiki page without source:: fails the brain-repo frontmatter lint

- **GIVEN** a brain-repo checkout containing a `wiki/*.md` page without any `source::` line
- **WHEN** the brain repo's frontmatter linter runs
- **THEN** it exits non-zero
- **AND** its output reports the missing `source::` back-reference for that file

#### Scenario: The orphan audit is advisory only

- **GIVEN** a wiki page that no MOC page links to via `[[slug]]`
- **WHEN** the orphan audit script runs
- **THEN** it lists the orphan page on stdout
- **AND** it exits zero

<!-- merged from change delta brain-foundation.md (afa4200ab852) -->