# openspec-embedding

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu openspec-embedding ergänzen._

## Requirements

### Requirement: Plan-Partials aus tasks.d/ werden als Factory-Slot-Einheit eingebettet

The system SHALL embed each plan partial from `tasks.d/*.md` as a single chunk with
`fileType='partial'` in the pgvector index, so that the large multi-slot plans are findable.
The chunk SHALL carry slot identity metadata from the manifest table (`partial_id`, `role`,
`target_files`, `depends_on`, `token_estimate`).

#### Scenario: tasks.d/ ist vierte Embedding-Quelle

- **GIVEN** `scripts/openspec-embed.mjs` baut Chunks
- **WHEN** die Quellen geprüft werden
- **THEN** ist `tasks.d/*.md` als vierte Quelle enthalten
- **AND** je Partial wird ein Chunk mit `fileType='partial'` erzeugt

#### Scenario: Chunk trägt Slot-Metadaten

- **GIVEN** ein Partial wird eingebettet
- **WHEN** die Metadaten geprüft werden
- **THEN** enthalten sie `partial_id`, `role`, `target_files`, `depends_on` und `token_estimate`

### Requirement: Partial-Größe wird begrenzt und ein einziger Schreibpfad genutzt

The system SHALL fail a plan partial larger than 7000 tokens in `scripts/plan-lint.sh`, and
SHALL use a single write path via the `ACTIVE_STATUSES` constant so that exactly one code path
writes to the index.

#### Scenario: Zu großer Partial schlägt fehl

- **GIVEN** ein Partial überschreitet 7000 Token
- **WHEN** `plan-lint.sh` läuft
- **THEN** schlägt der Lint fehl
- **AND** der Partial wird nicht eingebettet

#### Scenario: Ein einziger Schreibpfad existiert

- **GIVEN** die Embedding-Logik wird geprüft
- **WHEN** die Schreibpfade gezählt werden
- **THEN** existiert genau ein Schreibpfad
- **AND** er nutzt die `ACTIVE_STATUSES`-Konstante

<!-- merged from change delta openspec-embedding.md (764cda456460) -->

### Requirement: `--count-skipped` nennt betroffene Slugs und prüft typ-bewusst

The system SHALL, when `node scripts/openspec-embed.mjs --count-skipped` runs, apply a
chunk-type-aware token threshold instead of a single flat limit: chunks with
`fileType='partial'` SHALL be compared against the same 7000-token cap already enforced by
`scripts/plan-lint.sh` (T002453-C), while all other chunk types (`proposal`, `task_section`,
`spec_section`) SHALL be compared against the existing 2048-token default. The system SHALL
list the slug (and its worst chunk's approximate token count and file type) for every document
counted as skipped, in addition to the aggregate summary line.

#### Scenario: Ein plan-lint-legaler Partial wird nicht mehr fälschlich als Skip gezählt

- **GIVEN** ein aktiver Change hat einen `tasks.d/*.md`-Partial mit ~2100 geschätzten Token
  (unter dem 7000-Token-Deckel aus `scripts/plan-lint.sh`)
- **WHEN** `node scripts/openspec-embed.mjs --count-skipped` läuft
- **THEN** wird dieser Slug NICHT in der Skip-Zahl mitgezählt
- **AND** sein Slug erscheint NICHT in der Skip-Liste

#### Scenario: Ein illegal übergroßer Partial bleibt als Skip erkennbar

- **GIVEN** ein aktiver Change hat einen `tasks.d/*.md`-Partial über 7000 geschätzten Token
- **WHEN** `node scripts/openspec-embed.mjs --count-skipped` läuft
- **THEN** wird dieser Slug in der Skip-Zahl mitgezählt
- **AND** sein Slug samt geschätzter Token-Zahl erscheint in der Skip-Liste

### Requirement: `chunkProposal()` teilt übergroße Proposals per Token-Budget

The system SHALL split a `proposal.md` body that exceeds the 400-token chunk target into
multiple chunks using the same token-budget algorithm (`splitByTokenBudget`, 50-token overlap)
already used by `chunkSections()` for `tasks.md`/spec sections, instead of embedding the entire
body as a single unsplit chunk. Bodies at or below the target SHALL continue to produce exactly
one chunk.

#### Scenario: Kurzer Proposal-Body bleibt ein Chunk

- **GIVEN** ein `proposal.md`-Body liegt unter dem 400-Token-Zielwert
- **WHEN** `chunkProposal()` aufgerufen wird
- **THEN** wird genau ein Chunk erzeugt

#### Scenario: Langer Proposal-Body wird aufgeteilt

- **GIVEN** ein `proposal.md`-Body überschreitet den 400-Token-Zielwert
- **WHEN** `chunkProposal()` aufgerufen wird
- **THEN** werden mehrere Chunks erzeugt, jeder innerhalb des Budgets plus Overlap-Toleranz

<!-- merged from change delta openspec-embedding.md (3e68e53d44bd) -->