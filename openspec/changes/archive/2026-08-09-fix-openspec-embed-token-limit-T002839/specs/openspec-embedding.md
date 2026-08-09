## ADDED Requirements

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
