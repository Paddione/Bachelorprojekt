## ADDED Requirements

### Requirement: Blocked-Tickets mit offenem [T-Tag]-PR gehen nach in_review

Der Status-Drift-Watchdog MUSS Tickets im Status `blocked` mit einem offenen Pull
Request, dessen Titel den literalen `[T<external_id>]`-Tag trägt, nach Ablauf einer
Karenzzeit auf `in_review` überführen und dies per Audit-Kommentar dokumentieren.
`attention_mode` wird dabei auf `auto` zurückgesetzt; `readiness.factory_excluded`
bleibt unverändert `true`, weil die Ausschließung den Factory-Dispatch (nicht den
Review-Lebenslauf) steuert und ein automatisches Re-Dispatch blockierter Arbeit
verhindert werden soll.

#### Scenario: Blocked-Ticket mit passendem offenen PR wird überführt

- **GIVEN** ein Ticket mit `status='blocked'`, älter als die Karenzzeit
- **AND** ein offener PR mit dem Titel-Tag `[T<external_id>]`
- **AND** kein Agent-Lock auf dem Ticket
- **WHEN** der Drift-Watchdog läuft
- **THEN** der Ticket-Status ist `in_review` und `attention_mode` ist `auto`
- **AND** ein Audit-Kommentar nennt PR-Nummer und Übergang

#### Scenario: Blocked-Ticket ohne offenen PR bleibt blocked

- **GIVEN** ein Ticket mit `status='blocked'` und keinem offenen PR mit seinem `[T<id>]`-Tag
- **WHEN** der Drift-Watchdog läuft
- **THEN** bleibt der Status `blocked` — die Eskalation steht zu Recht
  (Pipeline fehlgeschlagen, keine sichtbare Arbeit); es wird kein Tick-Kommentar geschrieben

#### Scenario: Aktive Session wird nicht angetastet

- **GIVEN** ein Ticket mit `status='blocked'` und passendem offenen PR
- **AND** ein gehaltener Agent-Lock auf dem Ticket
- **WHEN** der Drift-Watchdog läuft
- **THEN** bleibt der Status `blocked`

#### Scenario: Dry-run schreibt nichts

- **GIVEN** ein Ticket mit `status='blocked'` und passendem offenen PR
- **WHEN** der Drift-Watchdog mit `--dry-run` läuft
- **THEN** meldet er den geplanten Übergang auf stderr
- **AND** der Ticket-Status bleibt `blocked`

### Requirement: gh-Ausfall bricht den Sweep nicht ab

Schlägt die PR-Listenabfrage fehl oder liefert sie kein Ergebnis, MUSS der Sweep
fail-open fortfahren (WARN auf stderr), ohne Tickets zu verändern.

#### Scenario: gh nicht verfügbar

- **GIVEN** das `gh`-Binary ist nicht installiert oder meldet einen Fehler
- **WHEN** der Drift-Watchdog läuft
- **THEN** bricht der Lauf nicht ab und ändert keinen Ticket-Status
