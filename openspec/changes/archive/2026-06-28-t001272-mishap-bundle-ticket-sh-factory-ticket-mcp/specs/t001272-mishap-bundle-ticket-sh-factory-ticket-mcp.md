## ADDED Requirements

### Requirement: Database Schema for Scout Drift (R1)

The system SHALL have the `scout_drift` and `scout_drift_at` columns present on the `tickets.tickets` table.

#### Scenario: Running Jaccard Drift persist command
- **GIVEN** the columns exist on the tickets database
- **WHEN** set-scout-drift is executed via scripts/ticket.sh
- **THEN** the drift score must be updated in the database successfully.

### Requirement: Lazy MCP Schemas (R3)

The system SHALL have JSON-formatted schema definitions for all ticket-mcp tools in the client's lazy-load directory.

#### Scenario: Querying MCP tools
- **GIVEN** the JSON schema files exist in the lazy-load directory
- **WHEN** the client list-tools query is processed
- **THEN** all ticket-mcp tools must be listed and ready to execute.
