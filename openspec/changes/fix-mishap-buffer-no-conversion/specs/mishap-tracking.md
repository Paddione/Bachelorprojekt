## ADDED Requirements

### Requirement: Die Repo-Wurzel des ticket-mcp wird zur Laufzeit aufgelöst

Der Runner MUST `TICKET_MCP_REPO_ROOT` bei **jedem** `RunTicket`-Aufruf auswerten, nicht nur
einmalig beim Programmstart. Ohne diese Zusicherung ist der in diesem Spec beschriebene
Stub-Mechanismus (`TICKET_SH` + `TICKET_MCP_REPO_ROOT`) zur Testlaufzeit wirkungslos: ein Test,
der beide Variablen setzt, trifft weiterhin die echte Repo-Wurzel und damit das reale
`scripts/ticket.sh`. Die Szenarien des Requirements „Der Mishap-Buffer aggregiert, er konvertiert
nicht" waren aus genau diesem Grund nicht prüfbar.

Die Pfad-Prüfung in `RunTicket` (`ticket.sh` MUST innerhalb der Repo-Wurzel liegen) MUST gegen
denselben, zur Laufzeit aufgelösten Wert erfolgen — nicht gegen einen abweichenden.

#### Scenario: Gesetzte Umgebungsvariable lenkt den Aufruf auf den Stub

- **GIVEN** `TICKET_MCP_REPO_ROOT` zeigt auf ein temporäres Verzeichnis
- **AND** `TICKET_SH` zeigt auf ein ausführbares Skript innerhalb dieses Verzeichnisses
- **WHEN** `RunTicket` nach dem Programmstart aufgerufen wird
- **THEN** das Skript aus `TICKET_SH` wird ausgeführt
- **AND** die Ausführung schlägt NICHT mit „No such file or directory" für `scripts/ticket.sh` fehl

#### Scenario: Ohne gesetzte Variable bleibt die Auflösung unverändert

- **GIVEN** `TICKET_MCP_REPO_ROOT` ist nicht gesetzt
- **WHEN** `RepoRoot()` aufgerufen wird
- **THEN** der beim Programmstart ermittelte Wert wird zurückgegeben
