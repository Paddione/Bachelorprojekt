## ADDED Requirements

### Requirement: Embed-Skript bietet einen zählenden Skip-Modus ohne Index-Änderung

The system SHALL provide a `--count-skipped` mode in `scripts/openspec-embed.mjs` that counts
skipped embeddings without modifying the index, reports the count and the reason separately
(at minimum distinguishing context-overflow from everything else), and names
`task openspec:embed:backfill` as the way to reduce the number.

#### Scenario: --count-skipped zählt ohne den Index zu verändern

- **GIVEN** der Embed-Index enthält übersprungene Dokumente
- **WHEN** `scripts/openspec-embed.mjs --count-skipped` ausgeführt wird
- **THEN** wird die Anzahl der übersprungenen Dokumente ausgegeben
- **AND** der Index wird dabei nicht verändert

#### Scenario: Zahl und Grund werden getrennt ausgewiesen

- **GIVEN** Dokumente wurden aus unterschiedlichen Gründen übersprungen
- **WHEN** `--count-skipped` läuft
- **THEN** nennt die Ausgabe die Zahl je Grund getrennt (z. B. Kontextüberschreitung
  gegenüber Parse-Fehler)
- **AND** die Ausgabe nennt `task openspec:embed:backfill` als Weg, die Zahl abzubauen

### Requirement: Embed-Wrapper meldet die Gesamtlage non-fatal

The system SHALL have `scripts/openspec-embed-local.sh` report the overall skip situation
after indexing, without blocking the commit when only the count is reported. The existing hard
error path for a failed embedding SHALL remain unchanged.

#### Scenario: Wrapper meldet die Gesamtlage nach dem Indizieren

- **GIVEN** ein Commit löst den Embed-Wrapper aus
- **WHEN** das Indizieren abgeschlossen ist
- **THEN** gibt der Wrapper die Gesamtzahl der übersprungenen Dokumente aus
- **AND** der Commit wird dadurch nicht blockiert

#### Scenario: Fehlgeschlagenes Embedding bleibt ein harter Fehler

- **GIVEN** ein Embedding schlägt tatsächlich fehl
- **WHEN** der Wrapper läuft
- **THEN** wird der bestehende harte Fehlerpfad ausgelöst
- **AND** die Meldung unterscheidet diesen Fall von einer reinen Zählung
