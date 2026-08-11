# batch-openspec-embed-fixes

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu batch-openspec-embed-fixes ergänzen._

## Requirements

### Requirement: Partial-Dateien token-budgetiert embedden

The system SHALL chunk `tasks.d/*`-Partial-Dateien mit derselben `splitByTokenBudget`-Mechanik wie proposal/tasks, sodass keine Datei ungesplittet als ein Chunk embedded wird.

#### Scenario: Partial größer als Token-Budget

- **GIVEN** eine `tasks.d/*`-Partial-Datei mit mehr Token als das Backend-Limit (2048 lokal / 4096 Cluster)
- **WHEN** `scripts/openspec-embed-local.sh` den Change indiziert
- **THEN** wird die Datei in Teil-Chunks mit Budget-Split embedded
- **AND** die Manifest-Metadaten je Teil-Chunk bleiben erhalten
- **AND** das Backend antwortet nicht mit `400 exceed_context_size`

#### Scenario: Parse-Schleife mit trägem Port-Forward

- **GIVEN** ein Port-Forward, der länger als der erste Read braucht
- **WHEN** `scripts/openspec-embed-local.sh` die `PF_PORT`-Zuweisung ausführt
- **THEN** schlägt die Iteration nicht still per `set -e` fehl
- **AND** das Skript wiederholt die Schleife statt mit rc=1 ohne Ausgabe zu enden

### Requirement: Port-Kollision nicht-fatal mit klarer Meldung

The system SHALL die bekannte Port-15432-Kollision in `openspec-embed.mjs` so behandeln, dass der Fehler explizit als Portkonflikt gemeldet wird und der Embed-Fehler nicht still verschwindet.

#### Scenario: Port 15432 durch k3d-Portforward belegt

- **GIVEN** der k3d-Portforward belegt localhost:15432
- **WHEN** der post-commit-Hook ein Embedding ausführt
- **THEN** meldet das Skript die Portkollision als Ursache
- **AND** der Retry läuft gegen den tatsächlich freien Port
- **AND** das Embedding gelingt oder der Fehlschlag ist eindeutig attribuiert

### Requirement: Falsche "Backend nicht erreichbar"-Ursache korrigieren

The system SHALL in Erreichbarkeitsfehlern den tatsächlichen Fehler (Timeout, HTTP-Status, DNS) ausgeben statt pauschal "nicht erreichbar" zu melden.

#### Scenario: Backend antwortet 200, Hook meldet unreachable

- **GIVEN** das Embedding-Backend auf :8081 antwortet mit HTTP 200
- **WHEN** der post-commit-Hook fehlschlägt
- **THEN** nennt die Meldung den konkreten Fehlerzustand
- **AND** nicht "Backend nicht erreichbar" als Ursache

### Requirement: openspec.sh archive im Batch-Modus skalieren

The system SHALL das Archivieren mehrerer Changes in einem Node-Prozess abarbeiten statt je Delta einen Prozess zu starten.

#### Scenario: Rückstand von N Changes archivieren

- **GIVEN** eine Schleife über N offene Changes
- **WHEN** `scripts/openspec.sh archive` im Batch-Modus läuft
- **THEN** startet der Merge nicht je Delta einen neuen Node-Prozess
- **AND** N Changes archivieren in deutlich unter N×3s

### Requirement: Platzhalter im Delta fail-closed ablehnen

The system SHALL ein unverändertes Stub-Delta (Platzhalter) mit Exit ≠ 0 ablehnen, bevor es archiviert werden kann.

#### Scenario: Unverändertes Stub-Delta

- **GIVEN** ein Change mit unverändertem Stub-Delta
- **WHEN** das Plan-Gate (plan-lint P1 oder openspec:validate) läuft
- **THEN** endet es mit Exit ≠ 0 (fail-closed)

#### Scenario: Ausformuliertes Delta

- **GIVEN** ein Change mit ausformuliertem Delta (Requirement + Scenario)
- **WHEN** dasselbe Gate läuft
- **THEN** passiert es (Positiv-Anker, keine vakue Zusicherung)

### Requirement: Embedding-Completeness durch Backfill herstellen

The system SHALL den Backfill-Pfad für aktive Pläne anbieten, die nie durch den Hook liefen, sodass die Collection den aktiven Plan-Bestand abdeckt.

#### Scenario: Collection deckt nur ein Fünftel der Pläne

- **GIVEN** die Collection enthält 12 docs, aber 57 lokale aktive Pläne
- **WHEN** `task openspec:embed:backfill` läuft
- **THEN** werden die fehlenden aktiven Pläne embedded
- **AND** das Completeness-Gate meldet danach keine Lücke mehr

### Requirement: Archiv-Commit ohne SKIP_MAIN_COMMIT_GUARD dokumentieren

The system SHALL den Archiv-Workflow so dokumentieren, dass der Archiv-Commit nicht den Main-Commit-Guard per Env-Bypass umgehen muss.

#### Scenario: Merge → Archive → Commit auf main

- **GIVEN** ein gemergter Change, der archiviert werden muss
- **WHEN** der Archiv-Commit auf main erstellt wird
- **THEN** ist im Runbook ein Weg dokumentiert, der ohne SKIP_MAIN_COMMIT_GUARD=1 auskommt
- **AND** der Guard bleibt für reguläre main-Commits aktiv

<!-- merged from change delta batch-openspec-embed-fixes.md (a2bdffb5dae9) -->