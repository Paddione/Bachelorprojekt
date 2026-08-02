## ADDED Requirements

### Requirement: Partielles Triage-Patch überschreibt den Ticket-Status nicht

Das `triage_ticket`-MCP-Tool (`scripts/ticket-mcp/go/internal/tools/triage.go`) SHALL den
`--status`-Parameter nur dann an die CLI weiterreichen, wenn der Aufrufer ihn explizit gesetzt
hat. Ein leerer oder fehlender `status` SHALL NICHT auf `"triage"` defaulten — dasselbe
Verhalten, das `priority`, `severity` und `type` bereits zeigen. Der zugrunde liegende
`triage.sh` behandelt ein leeres `--status` über `COALESCE` bereits korrekt; der Go-Wrapper
darf diese Semantik nicht unterlaufen.

#### Scenario: Nur attention_mode wird gepatcht, der Status bleibt erhalten

- **GIVEN** ein Ticket steht auf `status='plan_staged'`
- **WHEN** `triage_ticket` mit gesetztem `attention_mode`, aber ohne `status` aufgerufen wird
- **THEN** bleibt der Status `plan_staged`, und es wird kein `--status`-Argument an die CLI
  übergeben

#### Scenario: Ein explizit übergebener Status wird weiterhin angewendet

- **GIVEN** ein Ticket steht auf `status='triage'`
- **WHEN** `triage_ticket` mit `status='backlog'` aufgerufen wird
- **THEN** wird `--status backlog` an die CLI übergeben und der Status entsprechend gesetzt

#### Scenario: Kein Debug-Output auf dem MCP-Kanal

- **GIVEN** `triage_ticket` wird über den MCP-Server aufgerufen
- **WHEN** das Tool seine Argumente zusammenstellt
- **THEN** schreibt es keine Debug-Zeilen in die Ausgabe, die das MCP-Protokoll oder das
  Tool-Ergebnis verunreinigen könnten
