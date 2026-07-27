## MODIFIED Requirements

### Requirement: Semantic Code Search — Indexer (SCS-1)
<!-- bats: scs-index.bats -->

The system SHALL maintain a `scripts/index-repo.ts` indexer that creates `code_embeddings` and `file_dependencies` tables with pgvector support, uses the `bge-m3` model (1024 dimensions), supports incremental re-indexing via `--file` flag and SHA-256 hashing, and excludes `node_modules`/`dist`. The indexer SHALL verify that its embedding endpoint is reachable before use, SHALL abort with a non-zero exit code on connection failures instead of recording them as per-file skips, and SHALL report unchanged and failed files as separate counters.

#### Scenario: Verbindungsfehler bricht den Lauf ab *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `isInfrastructureError` durchsucht wird
- **THEN** wird die Klassifikationsfunktion mindestens zweimal gefunden

#### Scenario: Zaehler fuer unveraenderte und fehlgeschlagene Dateien sind getrennt *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `unchanged_files` und `failed_files` durchsucht wird
- **THEN** kommen beide Schluessel in der Abschluss-Ausgabe vor

#### Scenario: `scs:index` verwendet kein `fuser -k` *(BATS)*
- **GIVEN** der Task `scs:index` in `Taskfile.yml`
- **WHEN** seine ausfuehrbaren Zeilen nach `fuser -k` durchsucht werden
- **THEN** wird kein Treffer gefunden
