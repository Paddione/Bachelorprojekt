## ADDED Requirements

### Requirement: Laufzeitdateien spiegeln nur einen laufenden Daemon

The cockpit daemon SHALL write its PID and token files only after the socket is bound, and SHALL
remove them on shutdown, so that the files never describe a process that is not serving.

#### Scenario: Ein gescheiterter Start lässt den laufenden Daemon unangetastet

- **GIVEN** ein Daemon läuft und hat PID- und Token-Datei geschrieben
- **AND** er antwortet auf `/health` **als Positiv-Anker** (T002356-M1)
- **WHEN** ein zweiter Daemon auf demselben Port gestartet wird und mit `EADDRINUSE` scheitert
- **THEN** enthält die PID-Datei unverändert die PID des laufenden Daemons
- **AND** die Token-Datei enthält unverändert dessen Token
- **AND** ein `POST /api/cockpit/ticket-action` mit dem Token aus der Datei liefert HTTP 200

#### Scenario: Beim Beenden bleiben keine verwaisten Dateien zurück

- **GIVEN** ein laufender Daemon, dessen PID- und Token-Datei existieren **als Positiv-Anker**
  (T002356-M1)
- **WHEN** der Prozess per `SIGTERM` beendet wird
- **THEN** sind beide Dateien entfernt
- **AND** der Prozess läuft nicht mehr

#### Scenario: Das Verzeichnis der Laufzeitdateien ist umstellbar

- **GIVEN** die Umgebungsvariable `COCKPIT_DAEMON_STATE_DIR` zeigt auf ein Verzeichnis
- **WHEN** der Daemon startet
- **THEN** liegen PID- und Token-Datei in diesem Verzeichnis
- **AND** ohne die Variable liegen sie unverändert unter `/tmp`
