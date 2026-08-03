# factory-attempt-counter-T002389

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu factory-attempt-counter-T002389 ergänzen._

## Requirements

### Requirement: Attempt-Zähler unterscheidet Modell-Versagen von Infrastruktur-Abbruch

The system SHALL distinguish two failure classes in the factory attempt counter: a model
failure (pipeline ran, phase event written, result unusable) SHALL increment the counter,
while an infrastructure abort (no phase event, spawn failed, provider unreachable) SHALL NOT
increment it and SHALL retry the same escalation rung, so that a dead server does not burn
escalation rungs without a real model attempt.

#### Scenario: Modell-Versagen zählt hoch

- **GIVEN** die Pipeline lief und ein Phase-Event wurde geschrieben
- **WHEN** das Ergebnis unbrauchbar ist
- **THEN** wird der Attempt-Zähler erhöht
- **AND** die Eskalationsleiter rückt zur nächsten Sprosse vor

#### Scenario: Infrastruktur-Abbruch zählt nicht hoch

- **GIVEN** kein Phase-Event wurde geschrieben (Spawn fehlgeschlagen, Provider nicht erreichbar)
- **WHEN** die Watchdog-Runde endet
- **THEN** wird der Attempt-Zähler nicht erhöht
- **AND** dieselbe Eskalations-Sprosse wird wiederholt statt zur nächsten zu springen

<!-- merged from change delta factory-attempt-counter-T002389.md (cfe8d245ceae) -->