## ADDED Requirements

### Requirement: MCP-Gateway-Watchdog prüft die Tunnel-Liveness per echtem MCP-Initialize

The system SHALL provide a watchdog that probes the `mcp-gateway` port-forward tunnel with a
real MCP `initialize` HTTP-POST (not a TCP connect or a bare `/health`), because in the
failure mode the listener stays open and only the payload times out. The probe SHALL exit
non-zero on timeout or invalid response and SHALL name the failing port in its output.

#### Scenario: TCP-Listener ohne MCP-Antwort gilt als tot

- **GIVEN** der `port-forward`-Listener ist offen, antwortet aber nicht auf MCP-Payloads
- **WHEN** `probe.sh` ausgeführt wird
- **THEN** läuft der Probe in den Timeout
- **AND** der Exit-Code ist ungleich 0
- **AND** die Ausgabe nennt den geprüften Port

#### Scenario: Probe prüft alle vier Ports ohne --port

- **GIVEN** `probe.sh` wird ohne `--port` aufgerufen
- **WHEN** der Probe läuft
- **THEN** werden alle vier Ports der Unit geprüft (18080, 13000, 13001, 13002)
- **AND** ein fehlgeschlagener Port ist in der Ausgabe erkennbar

### Requirement: Watchdog startet den Tunnel bei Fehlschlag neu und verhindert Restart-Stürme

The system SHALL restart `mcp-gateway.service` when the probe fails, but SHALL NOT restart
when the target pod itself is unreachable, and SHALL limit consecutive restarts (at most one
per 5 minutes) to prevent a restart storm.

#### Scenario: Probe-Fehlschlag startet die Unit neu

- **GIVEN** `probe.sh` meldet einen Fehlschlag
- **WHEN** der Watchdog-Timer läuft
- **THEN** wird `mcp-gateway.service` neu gestartet
- **AND** der Restart ist auf höchstens einen je 5 Minuten begrenzt

#### Scenario: Toter Ziel-Pod löst keinen Tunnel-Neustart aus

- **GIVEN** der Ziel-Pod `claude-code-mcp-monolith` ist nicht erreichbar
- **WHEN** der Watchdog läuft
- **THEN** wird der Fehler protokolliert
- **AND** es wird kein Tunnel-Neustart ausgelöst
