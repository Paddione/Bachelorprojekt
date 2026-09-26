## ADDED Requirements

### Requirement: Merge-triggered in-cluster embeds

The system SHALL trigger an in-cluster embed job on every merge to `main` that
touches indexed paths, plus on manual `workflow_dispatch` for full runs. The
job SHALL embed the merge diff incrementally (full corpus when the diff is
empty), resumably, and fail visibly with the merge SHA in the log. CI runners
SHALL NOT embed locally and SHALL NOT hold DB credentials beyond the trigger.

#### Scenario: Merge embeds its diff

- **GIVEN** a merge to `main` touching indexed files
- **WHEN** the workflow runs
- **THEN** an in-cluster job starts with the merge diff
- **AND** the new content is similarity-findable afterwards

#### Scenario: Manual dispatch runs full

- **GIVEN** a maintainer triggers `workflow_dispatch`
- **WHEN** the job runs with an empty diff
- **THEN** it embeds the full corpus resumably

### Requirement: SSOT specs and docs are embedded

`scripts/openspec-embed.mjs` SHALL embed `openspec/specs/*.md` and the docs
globs into `knowledge.*` under sources `specs_ssot` and `docs`, idempotently
(delete+insert per path, as for changes). Existing sources and the
single-writer/completeness-gate semantics for `specs_plans` SHALL stay unchanged.

#### Scenario: Spec lands in its source

- **GIVEN** an SSOT spec file
- **WHEN** it is embedded
- **THEN** its chunks are stored under source `specs_ssot`
- **AND** re-embedding the unchanged file yields identical chunks

#### Scenario: Plans gate unaffected

- **GIVEN** the `specs_plans` completeness gate
- **WHEN** specs/docs sources grow
- **THEN** gate coverage still counts `specs_plans` slugs only

### Requirement: Unified prose chunking with migration

All prose chunking (proposals, sections, markdown docs) SHALL run through the
unified module `scripts/lib/scs-chunking.ts`. The existing changes-corpus SHALL
be re-embedded with the new chunker in batches, resumably, without changing
chunk identity for byte-identical inputs.

#### Scenario: One module chunks everything

- **GIVEN** a proposal, a spec section and a markdown doc
- **WHEN** each is chunked
- **THEN** all three go through the unified module
- **AND** outputs at or below budget are single chunks

#### Scenario: Corpus migration is resumable

- **GIVEN** a partially migrated changes-corpus
- **WHEN** migration resumes
- **THEN** already-migrated chunks are skipped by hash
- **AND** the run completes without duplicates

## MODIFIED Requirements

### Requirement: `chunkProposal()` teilt übergroße Proposals per Token-Budget

The system SHALL split a `proposal.md` body that exceeds the unified chunking
module's token budget into multiple chunks using that module's algorithm and
overlap, instead of the former `splitByTokenBudget` 400-token/50-overlap
routine. Bodies at or below the budget SHALL continue to produce exactly one
chunk.

#### Scenario: Kurzer Proposal-Body bleibt ein Chunk

- **GIVEN** ein `proposal.md`-Body liegt unter dem Modul-Budget
- **WHEN** `chunkProposal()` aufgerufen wird
- **THEN** wird genau ein Chunk erzeugt

#### Scenario: Langer Proposal-Body wird aufgeteilt

- **GIVEN** ein `proposal.md`-Body überschreitet das Modul-Budget
- **WHEN** `chunkProposal()` aufgerufen wird
- **THEN** werden mehrere Chunks erzeugt, jeder innerhalb des Budgets plus Overlap-Toleranz
