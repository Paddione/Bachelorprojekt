## MODIFIED Requirements

### Requirement: Synchrone Verifikation (Vordergrund)

Die lokale Verifikation in `opencode-flow-execute` (Schritt 3) SHALL synchron im Vordergrund
laufen. Kein Hintergrund-Task-Muster, kein Polling auf Benachrichtigungen, die einen
Sessionwechsel nicht ueberleben.

#### Scenario: Verifikation laeuft synchron

- **GIVEN** ein dev-flow-execute-Agent hat die Implementierung abgeschlossen
- **WHEN** er `task test:changed` oder `bats -r tests/spec/<domain>` aufruft
- **THEN** der Aufruf MUSS im Vordergrund blockieren bis zur vollstaendigen Ausfuehrung
- **AND** der Agent DARF NICHT parallel zur Verifikation weitere Schritte ausfuehren
- **AND** Exit-Code != 0 MUSS zum Abbruch fuehren (`|| exit 1`, kein `|| true`)

#### Scenario: Kein Hintergrund-Warte-Muster

- **GIVEN** ein dev-flow-execute-Agent hat die Verifikation gestartet
- **WHEN** die Verifikation laeuft
- **THEN** der Agent DARF NICHT "waiting for background task to complete" melden
- **AND** der Agent DARF NICHT vor Abschluss der Verifikation mit Commit/Push/PR fortfahren
- **AND** die Rueckmeldung ERST nach vollstaendigem Durchlauf erfolgen

### Requirement: Zielgerichtete Testauswahl

Statt `task test:changed` (das bei breitem Plan Minuten dauert) SHALL der Agent die vom Plan
beruehrten Test-Suiten direkt aufrufen.

#### Scenario: Testdomaene aus Branch-Diff ableiten

- **GIVEN** der Branch aendert Dateien unter `scripts/`
- **WHEN** der Agent die Verifikation startet
- **THEN** er SHALL `bats -r tests/spec/scripts* tests/spec/ticket-system*` aufrufen
- **AND** nur bei nicht zuordenbaren Aenderungen auf `task test:changed` als Fallback zurueckfallen

#### Scenario: Fallback bei breiten Aenderungen

- **GIVEN** der Branch aendert Dateien in mehreren nicht-zugeordneten Domaenen
- **WHEN** die heuristische Zuordnung scheitert
- **THEN** `task test:changed` SHALL als Fallback synchron ausgefuehrt werden
