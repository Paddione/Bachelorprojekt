# openspec-workflow

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Dieses Dokument beschreibt den OpenSpec-Workflow als Spec-first Entwicklungssteuerung im
Bachelorprojekt. Er umfasst die Verben `propose`/`apply`/`archive`/`validate`, das
Dateiformat-Konformitätsmodell, die Ticket-Lifecycle-Kopplung, die Statusmap-Generierung
und die CI-Integration.

---

### Requirement: Propose erstellt vollständiges Change-Skeleton

The system SHALL create a new change directory under `openspec/changes/<slug>/` with
`proposal.md`, `tasks.md`, a Delta-Spec unter `specs/<slug>.md`, und einer `.ticket`-Datei,
und SHALL den zugeordneten Ticket-Status auf `planning` setzen.

#### Scenario: Erfolgreicher propose-Aufruf

- **GIVEN** kein Change mit dem Slug existiert noch in `openspec/changes/`
- **WHEN** `task openspec:propose -- <slug> --ticket <ext-id>` ausgeführt wird
- **THEN** wird `openspec/changes/<slug>/` mit `proposal.md`, `tasks.md`, `specs/<slug>.md` und `.ticket` angelegt
- **AND** `.ticket` enthält die übergebene `<ext-id>`
- **AND** der Ticket-Status wird auf `planning` gesetzt

#### Scenario: Doppelter Slug wird abgelehnt

- **GIVEN** `openspec/changes/my-feature/` existiert bereits
- **WHEN** `task openspec:propose -- my-feature --ticket T000999` ausgeführt wird
- **THEN** schlägt der Befehl mit einer Fehlermeldung fehl, ohne bestehende Dateien zu überschreiben

#### Scenario: Fehlende Pflichtargumente

- **GIVEN** kein Change existiert
- **WHEN** `propose` ohne `--ticket`-Argument aufgerufen wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 und einer Fehlermeldung fehl

---

### Requirement: Apply setzt Change auf implementierbar (plan_staged)

The system SHALL verify that `tasks.md` in einem Change existiert und SHALL den
zugeordneten Ticket-Status auf `plan_staged` setzen, ohne Dateien zu verändern.

#### Scenario: Apply auf Change mit tasks.md

- **GIVEN** ein Change `openspec/changes/<slug>/` mit `tasks.md` existiert
- **WHEN** `task openspec:apply -- <slug>` ausgeführt wird
- **THEN** wird der Ticket-Status auf `plan_staged` gesetzt
- **AND** die Dateien im Change-Verzeichnis bleiben unverändert

#### Scenario: Apply ohne tasks.md schlägt fehl

- **GIVEN** ein Change existiert, aber `tasks.md` fehlt
- **WHEN** `task openspec:apply -- <slug>` ausgeführt wird
- **THEN** schlägt der Befehl mit einer Fehlermeldung fehl (Change nicht implementierbar)

---

### Requirement: Archive merged Delta in SSOT und schiebt Change ins Archiv

The system SHALL die Delta-Spec-Inhalte eines Changes in die entsprechende SSOT-Datei unter
`openspec/specs/<capability>.md` mergen, den Change nach
`openspec/changes/archive/<YYYY-MM-DD>-<slug>/` verschieben, und SHALL das Archivieren
verweigern, wenn der zugehörige Ticket-Status nicht `done` ist.

#### Scenario: Erfolgreiches Archive eines done-Tickets

- **GIVEN** ein Change mit Ticket-Status `done` und einer Delta-Spec `specs/<cap>.md` existiert
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird
- **THEN** werden die Requirements aus der Delta-Spec an die SSOT `openspec/specs/<cap>.md` angehängt
- **AND** das Change-Verzeichnis wird nach `openspec/changes/archive/<YYYY-MM-DD>-<slug>/` verschoben
- **AND** ein Merge-Kommentar-Header mit Datum wird in der SSOT eingefügt

#### Scenario: Archive bei nicht-done Ticket wird verweigert

- **GIVEN** ein Change existiert, aber der Ticket-Status ist `in_review`
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird
- **THEN** schlägt der Befehl mit einem Fehler ab (`archive refused: ticket status is 'in_review', expected 'done'`)
- **AND** keine Datei wird verändert oder verschoben

#### Scenario: SSOT-Datei wird angelegt, wenn sie noch nicht existiert

- **GIVEN** `openspec/specs/<cap>.md` existiert noch nicht
- **AND** ein Change mit einer Delta-Spec für diese Capability wird archiviert
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird
- **THEN** wird `openspec/specs/<cap>.md` neu erstellt und der Delta-Inhalt eingefügt

---

### Requirement: Validate ist ein fail-closed CI-Gate für Delta-Dateien

The system SHALL jede aktive Delta-Spec-Datei in `openspec/changes/*/specs/*.md` auf drei
Kriterien prüfen: Vorhandensein eines `## ADDED|MODIFIED|REMOVED Requirements`-Headers,
mindestens ein `### Requirement:`-Eintrag (H3), und Abwesenheit von H2-`## Requirement:`-Headern,
und SHALL mit Exit-Code ungleich 0 fehlschlagen, sobald eine Datei ein Kriterium verletzt.

#### Scenario: Wohlgeformter Change-Tree besteht Validation

- **GIVEN** alle Delta-Specs haben korrekte H2-Sektions-Header und H3-Requirement-Einträge
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** gibt der Befehl `openspec validate: OK` aus und beendet mit Exit-Code 0

#### Scenario: Falsche Heading-Ebene (H2 statt H3) schlägt fehl

- **GIVEN** eine Delta-Spec verwendet `## Requirement:` (H2) statt `### Requirement:` (H3)
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 fehl und benennt die fehlerhafte Datei

#### Scenario: Fehlender Operations-Header schlägt fehl

- **GIVEN** eine Delta-Spec enthält keinen `## ADDED|MODIFIED|REMOVED Requirements`-Header
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt der Befehl mit Exit-Code ungleich 0 fehl

#### Scenario: Archivierte Changes werden nicht validiert

- **GIVEN** ein Change unter `openspec/changes/archive/` hat eine fehlerhafte Delta-Spec
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** wird der archivierte Change übersprungen und der Befehl beendet mit Exit-Code 0

---

### Requirement: Statusmap-Generierung spiegelt den Change-Zustand als JSON

The system SHALL nach jedem `propose`-, `apply`- und `archive`-Aufruf automatisch
`website/src/data/openspec-status.json` regenerieren, die aktive Changes als `planning`
(ohne `tasks.md`) bzw. `plan_staged` (mit `tasks.md`) und archivierte Changes als `archived`
mit ihrem Ticket-Bezug ausgibt.

#### Scenario: Aktiver Change ohne tasks.md erscheint als planning

- **GIVEN** `openspec/changes/my-feature/` existiert ohne `tasks.md`, mit `.ticket`-Datei
- **WHEN** `scripts/openspec-status-map.sh` ausgeführt wird
- **THEN** enthält `website/src/data/openspec-status.json` einen Eintrag `{ ticket: "<id>", slug: "my-feature", status: "planning" }`

#### Scenario: Aktiver Change mit tasks.md erscheint als plan_staged

- **GIVEN** `openspec/changes/my-feature/` existiert mit `tasks.md` und `.ticket`-Datei
- **WHEN** `scripts/openspec-status-map.sh` ausgeführt wird
- **THEN** enthält die JSON-Ausgabe den Eintrag mit `status: "plan_staged"` für diesen Slug

#### Scenario: Archivierter Change erscheint als archived

- **GIVEN** ein Change liegt unter `openspec/changes/archive/<date>-<slug>/` mit `.ticket`-Datei
- **WHEN** `scripts/openspec-status-map.sh` ausgeführt wird
- **THEN** enthält die JSON-Ausgabe den Eintrag mit `status: "archived"` für diesen Slug

---

### Requirement: Lifecycle-Mapping koppelt OpenSpec-Phasen an Ticket-Statuses

The system SHALL die Ticket-Status-Übergänge konsistent mit den OpenSpec-Phasen halten:
`propose` → `planning`, `apply` → `plan_staged`, und `archive` SHALL nur erlaubt sein, wenn
der Ticket-Status `done` ist.

#### Scenario: Vollständiger Lifecycle eines Features

- **GIVEN** ein neues Feature-Ticket mit Status `triage`
- **WHEN** nacheinander `propose`, `apply`, das Ticket auf `done` gesetzt und dann `archive` ausgeführt werden
- **THEN** durchläuft der Ticket-Status die Stationen `planning` → `plan_staged` → `done`
- **AND** der Change landet schließlich im Archiv mit gemergetem Delta in der SSOT

---

### Requirement: Freshness-Check sichert Konsistenz der generierten Artefakte

The system SHALL im Rahmen des `freshness:check`-Gates die Aktualität von
`website/src/data/openspec-status.json` prüfen und SHALL fehlschlagen, wenn die Datei
gegenüber dem aktuellen Stand der `openspec/changes/`-Verzeichnisstruktur veraltet ist.

#### Scenario: Veraltete openspec-status.json blockiert CI

- **GIVEN** ein neuer Change wurde hinzugefügt, aber `openspec-status-map.sh` wurde nicht neu ausgeführt
- **WHEN** `task freshness:check` im CI ausgeführt wird
- **THEN** schlägt der Job fehl mit Hinweis auf die veraltete `website/src/data/openspec-status.json`

#### Scenario: Frische openspec-status.json lässt CI passieren

- **GIVEN** `openspec-status-map.sh` wurde nach der letzten Change-Änderung ausgeführt und die Datei ist committed
- **WHEN** `task freshness:check` ausgeführt wird
- **THEN** wird `website/src/data/openspec-status.json` als aktuell akzeptiert

---

### Requirement: Drop-in-Kompatibilität mit dem `openspec` npm CLI

The system SHALL das Dateilayout und das Deltaformat exakt so implementieren, dass
`npm i -g openspec` als vollständiger Drop-in-Ersatz für `scripts/openspec.sh`
funktioniert, ohne bestehende Dateien zu migrieren.

#### Scenario: SSOT-Dateien sind format-konform

- **GIVEN** eine SSOT-Datei `openspec/specs/<cap>.md` ist vorhanden
- **THEN** verwendet sie ausschließlich `### Requirement:` (H3) für Requirements und `#### Scenario:` (H4) für Szenarien mit `GIVEN/WHEN/THEN/AND`-Bullets

#### Scenario: Delta-Dateien sind format-konform

- **GIVEN** eine Delta-Spec `openspec/changes/<slug>/specs/<cap>.md` ist vorhanden
- **THEN** beginnt sie mit einem `## ADDED|MODIFIED|REMOVED Requirements`-Header (H2)
- **AND** Requirements sind als `### Requirement:` (H3) strukturiert
