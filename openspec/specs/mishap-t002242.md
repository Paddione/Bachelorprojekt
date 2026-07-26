# mishap-t002242

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-t002242 ergänzen._

## Requirements

### Requirement: M1 — Fail-closed Phase-Chain-Gate in devflow-ci-watch.sh

devflow-ci-watch.sh muss vor dem grünen Exit `exit 0` die Phase-Chain via assert-phase-chain prüfen und bei unvollständiger Kette mit Exit-Code 6 fehlschlagen.

#### Scenario: M1 — assert-phase-chain vor grünem Exit

- **GIVEN** scripts/devflow-ci-watch.sh erreicht den grünen Pfad (alle CI-Checks OK)
- **WHEN** die Phase-Chain ist noch nicht vollständig
- **THEN** wird assert-phase-chain einen Fehler melden und devflow-ci-watch.sh mit Exit 6 beenden

### Requirement: M2 — Git-Status-Guard vor Force-Remove in watchdog.sh

Der Zombie-Worktree-Cleanup in factory/watchdog.sh darf einen Worktree mit uncommitteten Änderungen nicht stillschweigend löschen.

#### Scenario: M2 — Worktree mit uncommitteten Änderungen wird nicht gelöscht

- **GIVEN** ein Worktree hat uncommittete Changes
- **WHEN** watchdog.sh versucht den Worktree zu entfernen
- **THEN** wird der Force-Remove übersprungen und ein Kommentar an das Ticket geschrieben
- **AND** cmd_reap() in agent-lock.sh dokumentiert, dass es keine Worktree-Verzeichnisse löscht

### Requirement: M3 — Exit-Code-Sammlung in devflow-post-merge-deploy.sh

devflow-post-merge-deploy.sh muss Task-Exit-Codes einsammeln und bei Fehlschlag `deploy blocked` statt `deploy done` melden.

#### Scenario: M3 — Task schlägt fehl während Deploy

- **GIVEN** ein Deploy-Task (z.B. feature:website) schlägt fehl
- **WHEN** devflow-post-merge-deploy.sh wird ausgeführt
- **THEN** wird der Exit-Code gesammelt und deploy/blocked anstatt deploy/done gemeldet
- **AND** das Skript beendet sich mit Exit 1

<!-- merged from change delta mishap-t002242.md (938bd2d87752) -->