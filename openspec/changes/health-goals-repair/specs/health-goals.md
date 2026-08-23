## ADDED Requirements

### Requirement: Ein Health-Goal muss unter realistischen Umständen rot werden können

Jedes Ziel in `.claude/lib/goals.md` SHALL so definiert sein, dass eine reale Verschlechterung es
verletzt. Eine Schwelle SHALL zum Messfenster des zugehörigen Messbefehls passen, und ein Ziel,
dessen gemessener Gegenstand nicht mehr existiert, SHALL zurückgebaut statt weitergeführt werden.

Nach einem erreichten Ziel SHALL die Schwelle auf den Ist-Wert plus eine kleine Reserve
nachgezogen werden. Eine Schwelle, die auf dem Baseline-Wert der Aufnahme stehen bleibt, erlaubt
stillschweigend die Rückkehr zum Ausgangszustand.

#### Scenario: Schwelle passt zum Messfenster

- **GIVEN** `G-DORA01` misst mit `git log --since="4 weeks ago"`
- **AND** das dokumentierte Ziel lautet 5 Merges pro Woche
- **WHEN** die Schwelle im Messskript geprüft wird
- **THEN** vergleicht sie gegen 20 (= 5 × 4 Wochen), nicht gegen 5

#### Scenario: Erreichtes Ziel zieht seine Schwelle nach

- **GIVEN** `G-CQ02` steht auf Ist 0
- **WHEN** die Schwelle geprüft wird
- **THEN** liegt sie bei 10 und nicht mehr beim Aufnahme-Baseline-Wert 280

### Requirement: Ein Messbefehl misst, was sein Titel behauptet

Der Messbefehl eines Ziels SHALL die im Titel benannte Größe erheben. `G-BRAIN14` („Brain-Ingest-
Backlog") SHALL die Zahl der **offenen** Chunks erheben, nicht die Zahl aller Manifest-Quellen.

Die Pending-Erhebung SHALL dieselbe Semantik verwenden wie `brain-ingest.sh process_page` — den
sha256 des Quell-Chunks gegen den State-Eintrag `<src_path>#<index>` — und SHALL dafür weder ein
Sprachmodell noch Netzzugriff benötigen, damit sie in CI lauffähig bleibt.

#### Scenario: Backlog zählt offene, nicht alle Quellen

- **GIVEN** das Manifest führt 172 Quellen
- **AND** der State weist die meisten davon als unverändert aus
- **WHEN** `scripts/brain-ingest-worklist.sh --pending` läuft
- **THEN** ist die ausgegebene Zahl kleiner als die Zahl der Manifest-Zeilen
- **AND** die Ausgabe ist eine einzelne Zahl

#### Scenario: Pending-Erhebung braucht kein Sprachmodell

- **GIVEN** `LM_MODEL` ist nicht gesetzt
- **WHEN** `scripts/brain-ingest-worklist.sh --pending` läuft
- **THEN** endet der Aufruf mit Exit 0 und gibt eine Zahl aus
