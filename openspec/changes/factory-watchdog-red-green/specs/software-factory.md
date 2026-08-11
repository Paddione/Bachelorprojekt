## MODIFIED Requirements

### Requirement: Attempt-Zähler-Fortschrittserkennung filtert nach abgeschlossenen Phasen

Der Watchdog-Attempt-Counter SHALL echten Fortschritt von blossem Phasen-Eintritt unterscheiden. Ein `factory_phase_events`-Eintrag SHALL den Zähler NUR dann auf `1` zurücksetzen, wenn sein `state` einen Abschluss (`done`, `partial-done`) oder einen Block (`blocked`) signalisiert. `entered`-Ereignisse ohne korrespondierendes Abschluss-Ereignis SHALL den Zähler nicht beeinflussen.

#### Scenario: entered-Event ohne done setzt Zähler nicht zurück

- **GIVEN** Ticket T003109 ist stale, sein Zähler `factory_attempt:T003109` steht auf `2`
- **AND** es existiert ein `factory_phase_events`-Eintrag mit `phase='implement'`, `state='entered'`, dessen `at` neuer ist als das `updated_at` des Zählers
- **AND** es existiert KEIN korrespondierender Eintrag mit `state='done'` oder `state='partial-done'`
- **WHEN** `watchdog.sh` ausgeführt wird
- **THEN** der Zähler steht auf `3` (nicht auf `1`)
- **AND** T003109 wird via `ticket.sh unfactory` eskaliert (weil MAX_ATTEMPTS=3 erreicht)

#### Scenario: partial-done-Event setzt Zähler zurück

- **GIVEN** Ticket T003109 ist stale, sein Zähler steht auf `2`
- **AND** es existiert ein `factory_phase_events`-Eintrag mit `phase='implement'`, `state='partial-done'`, dessen `at` neuer ist als das `updated_at` des Zählers
- **WHEN** `watchdog.sh` ausgeführt wird
- **THEN** der Zähler steht auf `1` (Fortschritt erkannt, Zähler zurückgesetzt)

#### Scenario: blocked-Event setzt Zähler zurück

- **GIVEN** Ticket T003109 ist stale, sein Zähler steht auf `2`
- **AND** es existiert ein `factory_phase_events`-Eintrag mit `phase='implement'`, `state='blocked'`, dessen `at` neuer ist als das `updated_at` des Zählers
- **WHEN** `watchdog.sh` ausgeführt wird
- **THEN** der Zähler steht auf `1`
