## ADDED Requirements

### Requirement: Dokumentierter Dry-Run-Einstieg ist ausführbar

Der dokumentierte Audit-Einstieg `task brain:ingest:dry` SHALL ohne manuelles Setzen von
Umgebungsvariablen ausführbar sein. Der Task SHALL `LM_MODEL` auf einen Default setzen
(überschreibbar via Environment) und SHALL den Ingest-Pool-Endpunkt (`http://localhost:8093`)
als Default für `LM_STUDIO_URL` verwenden.

Die T002533-Pflicht bleibt für Direktaufrufer von `scripts/brain-ingest.sh` bestehen: ohne
den Wrapper SHALL das Script weiterhin ohne `LM_MODEL` abbrechen.

#### Scenario: Dry-Run ohne Env-Setzung

- **GIVEN** keine der Variablen `LM_MODEL` oder `LM_STUDIO_URL` ist exportiert
- **WHEN** `task brain:ingest:dry` ausgeführt wird
- **THEN** bricht der Lauf nicht mit der T002533-Pflichtmeldung ab
- **AND** der Aufruf erreicht die Dry-Run-Logik von `scripts/brain-ingest.sh`

#### Scenario: Explizite Überschreibung

- **GIVEN** `LM_MODEL` ist vom Aufrufer explizit gesetzt
- **WHEN** `task brain:ingest:dry` ausgeführt wird
- **THEN** verwendet der Lauf den explizit gesetzten Wert statt des Defaults

#### Scenario: Doku-Verweis trifft zu

- **GIVEN** der system-audit-Skill verweist auf `task brain:ingest:dry`
- **WHEN** ein Auditierer dem Verweis folgt
- **THEN** existiert der Task in `Taskfile.yml`
