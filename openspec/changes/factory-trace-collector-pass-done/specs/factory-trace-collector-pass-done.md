## ADDED Requirements

### Requirement: Erfolgsfilter nutzt das reale verify/done-Signal

Der Trace-Kollektor `scripts/finetune/collect_factory_traces.py` SHALL einen
Ticket-Lauf nur dann in den Trainingskorpus aufnehmen, wenn mindestens ein
Phase-Event mit `phase == 'verify'` und `state == 'done'` vorliegt — die
Zustände der Aufnahme-Mechanik (`entered|done|blocked` gemäß
`record_phase_event`, vgl. software-factory REQ-SF-EXECUTOR-002). Ein
`verify/entered`- oder `verify/blocked`-Event gilt NICHT als Erfolg.

#### Scenario: Abgeschlossener Lauf wird aufgenommen

- **GIVEN** ein Ticket-Lauf mit `verify`/`done`-Event
- **WHEN** der Kollektor mit diesen Zeilen läuft
- **THEN** erscheint der Lauf im Korpus

#### Scenario: Nicht abgeschlossener Lauf wird verworfen

- **GIVEN** ein Ticket-Lauf, dessen verify-Event `state='entered'` trägt
- **WHEN** der Kollektor mit diesen Zeilen läuft
- **THEN** erscheint der Lauf NICHT im Korpus
