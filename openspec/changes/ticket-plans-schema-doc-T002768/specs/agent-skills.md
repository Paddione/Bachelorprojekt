# Delta: agent-skills

## MODIFIED Requirements

### Requirement: mcp-tool-guide dokumentiert ticket_plans-Spalten
Der mcp-tool-guide MUSS die vorhandenen Spalten von `tickets.ticket_plans` nennen und
klarstellen, dass `status` NICHT zu dieser Tabelle gehört.

#### Scenario: mcp-tool-guide listet ticket_plans-Spalten

- **GIVEN** die Datei `.claude/skills/references/mcp-tool-guide.md`
- **WHEN** die ticket_plans-Dokumentation gelesen wird
- **THEN** sie listet die vorhandenen Spalten `id`, `branch`, `pr_number`, `content`
- **AND** sie stellt klar, dass `status` nicht zu dieser Tabelle gehört
