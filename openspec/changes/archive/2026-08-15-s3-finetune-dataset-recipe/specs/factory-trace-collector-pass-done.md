## ADDED Requirements

### Requirement: Kontext-Anreicherung ist Flag-gesteuert und ändert den Default nicht

Der Trace-Kollektor `scripts/finetune/collect_factory_traces.py` SHALL eine optionale
Anreicherung der Trainings-Turns um Ticket-Beschreibung und -Kommentare anbieten, die
nur bei explizitem Flag (`--with-context`) aktiv ist. Ohne das Flag SHALL die Ausgabe
byte-identisch zum bisherigen Verhalten bleiben, sodass bestehende Aufrufer und
Fixture-Tests unverändert gültig sind.

#### Scenario: Default bleibt unverändert

- **GIVEN** ROWS_JSON ohne Anreicherungsdaten
- **WHEN** der Kollektor ohne `--with-context` läuft
- **THEN** entspricht die Ausgabe dem bisherigen Format (nur Phase-Event-Turns)

#### Scenario: Flag aktiviert die Anreicherung

- **GIVEN** ROWS_JSON sowie Beschreibungs- und Kommentarzeilen desselben Tickets
- **WHEN** der Kollektor mit `--with-context` läuft
- **THEN** enthält die Ausgabe zusätzlich Beschreibungs- und Kommentar-Turns in
  chronologischer Reihenfolge

### Requirement: Kommentar-Rollen-Mapping folgt der E7-Konvention

Beim Rendern der Kontext-Turns SHALL der Kollektor Autoren der Labels `claude-code`
und `factory` als `assistant`-Turn abbilden; alle übrigen Autoren SHALL als
`user`-Turn erscheinen.

#### Scenario: Factory-Kommentar wird assistant-Turn

- **GIVEN** einen Kommentar mit Autor `factory`
- **WHEN** der Kollektor den Kommentar rendert
- **THEN** ist der Turn im Chat-Format als `assistant` markiert

#### Scenario: Fremdautor wird user-Turn

- **GIVEN** einen Kommentar mit Autor außerhalb von `claude-code`/`factory`
- **WHEN** der Kollektor den Kommentar rendert
- **THEN** ist der Turn im Chat-Format als `user` markiert

### Requirement: Secret-Redaktion erstreckt sich auf angereicherte Felder

Die bestehende Secret-Redaktion SHALL auf alle angereicherten Felder
(Beschreibung, Kommentar-Body) angewendet werden, bevor die Zeilen in das
Korpus-Format gerendert werden.

#### Scenario: Redaktion greift im Kommentar-Body

- **GIVEN** einen Kommentar, dessen Body ein von der Redaktion abgedecktes
  Secret-Muster enthält
- **WHEN** der Kollektor mit `--with-context` läuft
- **THEN** erscheint das Muster in der Ausgabe redigiert, nicht im Klartext
