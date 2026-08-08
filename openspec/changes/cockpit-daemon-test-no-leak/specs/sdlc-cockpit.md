## ADDED Requirements

### Requirement: Tests lassen keinen Daemon-Prozess zurück

Tests that start the cockpit daemon SHALL terminate it completely, so that no process keeps
listening on a test port after the run.

#### Scenario: Der Runtime-Contract-Test hinterlässt keinen Lauscher

- **GIVEN** auf dem Testport lauscht niemand **als Positiv-Anker** (T002356-M1)
- **WHEN** `tests/spec/sdlc-cockpit/daemon-runtime-contract.bats` Test 3 ausgeführt wird
- **AND** dieser Lauf mit Exit-Code 0 endet **als Positiv-Anker** (T002356-M1)
- **THEN** antwortet auf dem Testport danach niemand mehr

#### Scenario: Der Test schreibt nicht in den Zustand eines echten Daemons

- **GIVEN** ein Test startet den Daemon
- **WHEN** er `COCKPIT_DAEMON_STATE_DIR` auf ein eigenes Verzeichnis setzt
- **THEN** liegen PID- und Token-Datei dort
- **AND** `/tmp/cockpit-daemon.pid` bleibt unberührt
