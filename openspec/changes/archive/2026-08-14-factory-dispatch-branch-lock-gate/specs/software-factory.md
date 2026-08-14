# software-factory Delta — Factory Dispatch Branch-Lock-Gate

## ADDED Requirements

### Requirement: Dispatch-Branch-Lock-Gate

The system SHALL, before launching a pipeline orchestrator for a `plan_staged` ticket,
verify via `agent-lock.sh check branch <branch>` that the target branch is not already
claimed by another live session. When the branch IS claimed, the launch SHALL be skipped
without changing the ticket status, and the skip SHALL be reported with the lock reason
instead of silently disappearing.

#### Scenario: Branch frei — Launch passiert das Gate

- **GIVEN** ein `plan_staged`-Ticket mit Branch auf `origin`, Plan-Datei auf dem Branch und keinem branch-scoped agent-lock auf diesen Branch
- **WHEN** `dispatcher-bridge.sh` die Launch-Zeile verarbeitet
- **THEN** der Launch wird angekündigt bzw. ausgeführt (Positiv-Anker: das Gate ist durchlässig)

#### Scenario: Branch branch-scoped geclaimt — kein zweiter Orchestrator

- **GIVEN** eine laufende Session hält den branch-scoped Lock auf den Ziel-Branch (z. B. `agent-lock.sh claim branch <branch>` durch `dev-flow-execute`)
- **WHEN** `dispatcher-bridge.sh` die Launch-Zeile verarbeitet
- **THEN** der Launch wird NICHT ausgeführt und NICHT als Dry-Run angekündigt; die Ausgabe nennt den Lock-Grund (`lock`/`claim`/`held`); der Ticket-Status bleibt unverändert

#### Scenario: Zweite Verteidigungslinie in opencode-exec

- **GIVEN** ein direkter Aufruf von `opencode-exec.sh` mit Branch und Plan, während der Branch branch-scoped geclaimt ist
- **WHEN** das Skript den Orchestrator starten will
- **THEN** Exit 7 (gar nicht erst gestartet) mit Lock-Grund in der Ausgabe; ein freier Branch ergibt unter denselben Bedingungen den normalen Lauf-Exit (Positiv-Anker)
