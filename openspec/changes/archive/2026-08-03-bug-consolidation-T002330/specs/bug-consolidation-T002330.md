## ADDED Requirements

### Requirement: Bug-Verwaltung läuft ausschließlich über den tickets-Pfad

The system SHALL consolidate bug management onto the single `/api/admin/tickets/*` path and
SHALL remove the parallel `/api/admin/bugs/*` endpoints and the `/api/bug-report` route, so
that bug and ticket handling share one code path instead of two divergent ones.

#### Scenario: /api/admin/bugs/* ist entfernt

- **GIVEN** die Admin-API wird auf ihre Routen geprüft
- **WHEN** die Endpoints `/api/admin/bugs/{create,list,resolve,reopen,assign,delete,show}`
  aufgelistet werden
- **THEN** existiert keiner dieser Endpoints mehr
- **AND** die Funktionalität ist über `/api/admin/tickets/*` erreichbar

#### Scenario: Bug-Report-Route ist auf den tickets-Pfad migriert

- **GIVEN** ein Nutzer sendet einen Bug-Report
- **WHEN** die `/api/bug-report`-Route aufgerufen wird
- **THEN** wird der Report als Ticket über den tickets-Pfad angelegt
- **AND** die alte Bug-Helper-Klasse ist abgebaut

### Requirement: Bug/Kategorie-Differenzierung über eine scope-Spalte

The system SHALL introduce a `scope` column to distinguish bug and category entries on the
shared tickets table, so that consolidated records remain distinguishable after the bug path
is removed.

#### Scenario: scope-Spalte unterscheidet Bug von Kategorie

- **GIVEN** die tickets-Tabelle enthält die neue `scope`-Spalte
- **WHEN** ein Bug-Report und ein Kategorie-Eintrag angelegt werden
- **THEN** tragen sie unterschiedliche `scope`-Werte
- **AND** die Abfrage nach Bugs liefert nur Bug-Einträge

### Requirement: FA-26 Bug-Report-E2E-Test ist auf den tickets-Pfad migriert

The system SHALL migrate or remove the FA-26 bug-report E2E test so it exercises the
consolidated tickets path instead of the removed bug endpoints.

#### Scenario: FA-26 testet den tickets-Pfad

- **GIVEN** der FA-26 E2E-Test wird ausgeführt
- **WHEN** er einen Bug-Report über den konsolidierten Pfad anlegt
- **THEN** schlägt der Test nicht wegen fehlender `/api/bug-report`-Route fehl
- **AND** der Test validiert die Bug-Erstellung über `/api/admin/tickets/*`
