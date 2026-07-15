## ADDED Requirements

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
