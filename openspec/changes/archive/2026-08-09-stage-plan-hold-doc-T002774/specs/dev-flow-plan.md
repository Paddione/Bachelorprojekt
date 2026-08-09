# Delta: dev-flow-plan

## ADDED Requirements

### Requirement: Fix-Pfad stage-plan verwendet --hold

Das Referenzbeispiel des Fix-Pfads für `stage-plan` MUSS `--hold` enthalten, damit das Ticket
nicht sofort von der Factory dispatched wird. Der Feature-Pfad (`ticket-stage-procedure.md`)
dokumentiert `--hold` bereits; der Fix-Pfad muss gleichziehen.

#### Scenario: CLI-Fallback enthält --hold

- **GIVEN** ein Fix-Ticket ist bereit zum Stagen
- **WHEN** der Planer `scripts/ticket.sh stage-plan` im Fix-Pfad aufruft
- **THEN** der Aufruf enthält `--hold`
- **AND** das Ticket wird NICHT sofort dispatched

#### Scenario: MCP stage_plan unterstützt hold

- **GIVEN** der MCP-First-Pfad via `mcp__ticket-mcp__stage_plan`
- **WHEN** der Aufruf `hold: true` enthält
- **THEN** `ticket.sh stage-plan` wird mit `--hold` aufgerufen
- **AND** `readiness.execution_released` wird auf `false` gesetzt
