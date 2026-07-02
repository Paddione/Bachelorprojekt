## ADDED Requirements

### Requirement: applyDelta erkennt Merges eindeutig anhand des Delta-Inhalts, nicht anhand von Dateiname und Datum

The system SHALL den Merge-Marker (`<!-- merged from change delta … -->`) aus einem
Inhalts-Hash der Delta-Datei ableiten, statt aus `basename(deltaPath)` und dem
Kalenderdatum. Zwei unterschiedliche Delta-Dateien mit demselben Dateinamen (die
Parent-SSOT-Slug-Konvention benennt alle Deltas gegen dasselbe SSOT-Ziel identisch)
SHALL unabhängig voneinander gemerged werden, auch wenn sie am selben Kalendertag
angewendet werden. Ein erneutes Anwenden derselben (byte-identischen) Delta-Datei
SHALL weiterhin als bereits gemergt übersprungen werden (idempotent).

#### Scenario: Zwei unterschiedliche Deltas mit identischem Dateinamen werden beide gemerged

- **GIVEN** zwei Delta-Dateien mit demselben Basisnamen (z.B. `openspec-workflow.md`),
  aber unterschiedlichem Inhalt, beide gegen dasselbe SSOT gerichtet
- **WHEN** beide am selben Kalendertag nacheinander per `applyDelta()` angewendet werden
- **THEN** enthält die SSOT-Datei danach die Requirements aus beiden Deltas

#### Scenario: Erneutes Anwenden derselben Delta-Datei ist ein No-op

- **GIVEN** eine Delta-Datei wurde bereits erfolgreich gemergt
- **WHEN** `applyDelta()` erneut mit derselben (byte-identischen) Delta-Datei gegen
  dieselbe SSOT-Datei aufgerufen wird
- **THEN** meldet der Befehl `skip (already merged): <deltaName>` und ändert die
  SSOT-Datei nicht

### Requirement: applyDelta verweigert ADDED-Requirements mit bereits existierendem Namen

The system SHALL, wenn ein `## ADDED Requirements`-Eintrag einen Requirement-Namen
trägt, der in der Ziel-SSOT-Datei bereits existiert, den Merge fail-closed abbrechen
(Exit-Code ungleich 0), analog zum bestehenden Verhalten bei `MODIFIED`/`REMOVED`/
`RENAMED` gegen einen fehlenden Namen.

#### Scenario: ADDED mit bereits existierendem Requirement-Namen schlägt fehl

- **GIVEN** die SSOT-Datei enthält bereits `### Requirement: Block A`
- **WHEN** ein Delta mit `## ADDED Requirements` und `### Requirement: Block A`
  gegen dieselbe SSOT-Datei angewendet wird
- **THEN** bricht `applyDelta()` mit einer Fehlermeldung ab, die auf `MODIFIED` als
  Alternative verweist
- **AND** die SSOT-Datei bleibt unverändert
