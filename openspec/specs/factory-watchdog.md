# factory-watchdog

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu factory-watchdog ergänzen._

## Requirements

### Requirement: Ticket-Status-Reaper für verwaiste in_progress
Der Watchdog MUSS `in_progress`-Tickets ohne Agent-Lock und ohne Remote-Branch nach einer
Karenzzeit auf `triage` zurücksetzen.

#### Scenario: Verwaistes in_progress-Ticket wird zurückgesetzt

- **GIVEN** ein Ticket mit Status `in_progress`, seit >24h ohne Agent-Lock und ohne Remote-Branch
- **WHEN** der Watchdog läuft
- **THEN** das Ticket wird auf `triage` zurückgesetzt
- **AND** ein Kommentar dokumentiert die Zurücksetzung

<!-- merged from change delta factory-watchdog.md (6324695eb281) -->

### Requirement: Claim-Readiness-Gate vor Gang-Slot-Claim

schedule.sh DARBEI einen Gang-Slot nur für Tickets claimen, die die
Launch-Readiness erfüllen (Branch und Plan-Pfad vorhanden). Planlose Rows
werden übersprungen, bleiben im Status backlog und erzeugen eine
Journal-Zeile; ihr Status darf nicht auf in_progress wechseln.

#### Scenario: planloses locked-Feat wird nicht geclaimt

- **GIVEN** ein Ticket type=feat, lastenheft_locked, status=backlog, ohne
  FACTORY-PLAN-REF (branch/plan_path leer)
- **WHEN** schedule.sh den Dispatch-Vorbereitungslauf ausführt
- **THEN** wird kein Slot geclaimt, der Ticket-Status bleibt backlog
- **AND** das Journal enthält `not ready (readiness=missing_args) — not claimed`

### Requirement: Unlesbarer INFRA-Counter blockiert Eskalation nicht dauerhaft

Der Watchdog protokolliert Counter-Lesefehler auf stderr, zählt konsekutive
unlesbare Runden je Ticket und eskaliert nach MAX_INFRA_ATTEMPTS unlesbaren
Runden via unfactory. Der Bounce-Kommentar kennzeichnet den Zähler als
`ERR` statt `?`.

#### Scenario: Counter bleibt drei Runden unlesbar

- **GIVEN** factory_psql liefert bei drei aufeinanderfolgenden Sweeps keine
  numerische Attempt-Antwort für dasselbe Ticket
- **WHEN** der dritte Sweep läuft
- **THEN** eskaliert der Watchdog (unfactory) statt erneut zu resetten

### Requirement: DB-Identitätscheck vor Reset-Writes

Vor dem ersten Reset-Write eines Sweeps prüft der Watchdog, dass
factory_psql-Pfad und ticket.sh-Pfad dieselbe Datenbank auflösen (Marker-
Abgleich über beide Routen). Bei Mismatch bricht der Sweep mit Fehler ab,
ohne Status zu ändern.

#### Scenario: Watchdog löst auf zwei verschiedene Datenbanken auf

- **GIVEN** factory_psql und ticket.sh erreichen unterschiedliche DBs
- **WHEN** der Watchdog-Sweep startet
- **THEN** bricht er mit einer expliziten Fehlermeldung ab und schreibt
  keinen Status-Reset und keinen Bounce-Kommentar

### Requirement: STALE_MIN-Floor in Produktion

Ohne explizites Opt-out (`FACTORY_ALLOW_STALE_MIN_ZERO=1`) wird ein
FACTORY_STALE_MIN-Wert unter 5 Minuten auf 5 angehoben; die Anhebung wird
im Journal vermerkt.

#### Scenario: Sweep mit STALE_MIN=0 ohne Opt-out

- **GIVEN** FACTORY_STALE_MIN=0 und FACTORY_ALLOW_STALE_MIN_ZERO unset
- **WHEN** watchdog.sh startet
- **THEN** läuft der Sweep mit STALE_MIN=5 und journalisiert die Anhebung

<!-- merged from change delta factory-watchdog.md (0b3e1e29e7c1) -->