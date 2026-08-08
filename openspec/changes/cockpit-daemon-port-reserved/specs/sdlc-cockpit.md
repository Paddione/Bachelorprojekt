## ADDED Requirements

### Requirement: Daemon-Port außerhalb reservierter Portbereiche

The cockpit daemon SHALL use a default port outside the port ranges reserved by Windows/Hyper-V on
WSL2 hosts, and outside the local ephemeral port range, so that it can bind on the development
platform it targets.

#### Scenario: Kein Cockpit-Port liegt im Hyper-V-Reservierungsbereich

- **GIVEN** die Port-Konfiguration in `.lavish/kit/daemon/server.ts`, `.lavish/kit/adapter.js`,
  `Taskfile.yml` und den Testdateien unter `tests/spec/sdlc-cockpit/`
- **WHEN** die dort verdrahteten Portwerte gesammelt werden
- **THEN** liegt keiner im Bereich 49152–49251
- **AND** der Default-Port in `server.ts` ist auffindbar und größer als 1024 **als Positiv-Anker**
  (T002356-M1)

#### Scenario: Daemon bindet auf dem Default-Port

- **GIVEN** ein WSL2-Host, auf dem `netsh interface ipv4 show excludedportrange protocol=tcp` den
  Bereich 49152–49251 als ausgeschlossen ausweist
- **WHEN** der Daemon ohne `COCKPIT_DAEMON_PORT` gestartet wird
- **THEN** antwortet `GET /health` auf dem Default-Port
- **AND** es tritt kein `EADDRINUSE` auf

---

### Requirement: Ehrliche Startmeldung des Daemons

The cockpit daemon SHALL report a successful start only after the socket is actually bound, and
SHALL report a failed bind with port, cause and remedy in plain language instead of an unhandled
error stack trace.

#### Scenario: Kein Erfolgs-Log ohne Erfolg

- **GIVEN** ein Port, den ein anderer Prozess bereits hält
- **AND** dieser Prozess antwortet auf dem Port **als Positiv-Anker** (T002356-M1)
- **WHEN** der Daemon mit `COCKPIT_DAEMON_PORT` auf genau diesen Port gestartet wird
- **THEN** enthält seine Ausgabe kein `listening on`
- **AND** die Ausgabe nennt den betroffenen Port und die Ursache (`EADDRINUSE`, belegt oder
  reserviert)
- **AND** der Prozess endet mit einem Exit-Code ungleich 0

## MODIFIED Requirements

### Requirement: Livedaten statt Fixtures

The daemon SHALL serve real data from `kubectl --context fleet`, `gh-axi`, `git`, `agent-lock.sh`,
`ticket-mcp`, `factory-mcp`, and opencode.db, replacing all K1 fixture arrays.

#### Scenario: Cluster-Daten sind live

- **GIVEN** der Daemon läuft auf Port 39152
- **WHEN** `GET /api/admin/cluster/pods-list?namespace=workspace` aufgerufen wird
- **THEN** enthält die Antwort `fetchedAt` (ISO 8601 Timestamp)
- **AND** die Antwort enthält echte Pod-Daten (nicht die K1-Fixtures mit `ollama-llama-cpp-7f9d6`)
- **AND** kein `error`-Feld, wenn `kubectl` erreichbar ist

#### Scenario: Agent-Daten aus agent-lock.sh

- **GIVEN** der Daemon läuft
- **WHEN** `GET /api/cockpit/agents` aufgerufen wird
- **THEN** enthält die Antwort mindestens die Felder `sid`, `label`, `ticket`, `worktree`, `status`
