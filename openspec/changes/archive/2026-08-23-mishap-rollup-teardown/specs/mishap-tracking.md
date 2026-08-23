## MODIFIED Requirements

### Requirement: Factory-Fix-Tickets verwenden nicht plan_staged ohne Plan

Factory-Fix-Tickets, die von `mishap.go` aus nicht-kritischen Mishaps erzeugt werden, MÜSSEN
`status=triage` verwenden. `status=plan_staged` ist ausschließlich Tickets vorbehalten, die via
`stage-plan.sh` mit validiertem `--plan` und `--branch` gestaged wurden.

#### Scenario: drift-Mishap erzeugt triage-Ticket

- **GIVEN** ein nicht-kritischer Mishap vom Typ `drift` wird via `report_mishap` gemeldet
- **AND** der Buffer-Schwellwert (10) ist erreicht
- **WHEN** `buildFactoryFixTicketArgs` die Ticket-Args baut
- **THEN** das Ticket hat `--status triage`
- **AND** das Ticket hat NICHT `--status plan_staged`

#### Scenario: Incident-Tickets unverändert

- **GIVEN** ein Incident-Mishap (`broken`, `security`) wird gemeldet
- **WHEN** `buildIncidentTicketArgs` die Ticket-Args baut
- **THEN** das Ticket hat `--status triage` (unverändert)
- **AND** `--attention-mode needs_human` (unverändert)

## ADDED Requirements

### Requirement: Nicht-kritische Mishaps werden am Verursacher-Ticket vermerkt

Ein nicht-kritischer Mishap, der während der Bearbeitung eines Tickets auftritt, SHALL als
Kommentar an genau dieses Ticket geschrieben werden. Es SHALL kein Sammel-Container, kein
Zyklus-Plan und kein eigenes Folge-Ticket dafür erzeugt werden.

Fehlt der Ticket-Kontext, SHALL der Mishap auf stderr protokolliert und verworfen werden. Das
Fehlen eines Ticket-Kontexts SHALL NICHT dazu führen, dass ein Ticket angelegt wird.

#### Scenario: Mishap mit Ticket-Kontext landet als Kommentar

- **GIVEN** `scripts/hooks/mishap-tracker.sh` läuft am Ende eines dev-flow-Skills
- **AND** die Umgebung trägt eine Ticket-ID des bearbeiteten Tickets
- **AND** ein nicht-kritischer Mishap-Eintrag liegt vor
- **WHEN** der Tracker den Eintrag verarbeitet
- **THEN** ruft er `ticket.sh comment` mit genau dieser Ticket-ID auf
- **AND** legt kein weiteres Ticket an

#### Scenario: Mishap ohne Ticket-Kontext erzeugt kein Ticket

- **GIVEN** `scripts/hooks/mishap-tracker.sh` läuft ohne Ticket-ID in der Umgebung
- **AND** ein nicht-kritischer Mishap-Eintrag liegt vor
- **WHEN** der Tracker den Eintrag verarbeitet
- **THEN** wird der Eintrag auf stderr protokolliert
- **AND** es wird kein Ticket und kein Container angelegt
- **AND** der Exit-Code ist 0

### Requirement: Kein Automat erzeugt Mishap-Sammelcontainer

Es SHALL keinen periodisch laufenden Prozess geben, der ein Sammel-Ticket für Mishaps anlegt,
einen Plan daraus generiert oder Einträge über Zyklen hinweg weiterreicht. Insbesondere SHALL
`scripts/factory/wakeup.sh` keinen Rollup-Generator aufrufen und `scripts/ticket.sh` kein
Kommando bereitstellen, das bei erfolgloser Suche ein Sammel-Ticket anlegt.

#### Scenario: wakeup.sh ruft keinen Rollup-Generator

- **GIVEN** das Repository auf `main`
- **WHEN** `scripts/factory/wakeup.sh` nach `mishap-rollup` durchsucht wird
- **THEN** enthält die Datei keinen Aufruf eines Rollup-Generators

#### Scenario: ticket.sh kennt kein rollup-container-Kommando

- **GIVEN** das Repository auf `main`
- **WHEN** `scripts/ticket.sh rollup-container` aufgerufen wird
- **THEN** ist der Exit-Code ungleich 0
- **AND** es wird kein Ticket mit dem Titel `Mishap Rollup — fortlaufende Sammlung` angelegt
