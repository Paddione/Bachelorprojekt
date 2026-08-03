## ADDED Requirements

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
