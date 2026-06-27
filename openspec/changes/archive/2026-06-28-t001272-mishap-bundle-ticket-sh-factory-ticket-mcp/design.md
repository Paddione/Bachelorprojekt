# Design: t001272-mishap-bundle-ticket-sh-factory-ticket-mcp

## Purpose (Zweck)

Behebung von drei getrennten Mishaps (Friction-Punkten) im Projekt-Tooling, die während der automatisierten Software-Factory- und Ticket-Verarbeitung aufgetreten sind:

1. **Datenbankschema-Fehler (Scout Drift):**
   Das Skript `scripts/ticket.sh` referenziert in `cmd_set_scout_drift` die Spalte `scout_drift` in der Tabelle `tickets.tickets`. Diese Spalte (sowie `scout_drift_at`) existiert auf den Produktiv- und Dev-Datenbanken nicht, obwohl eine Migrationsdatei `scripts/migrations/2026-06-17-scout-drift.sql` bereitsteht. Wir führen diese Migration auf beiden Datenbankinstanzen (`workspace` und `workspace-korczewski`) aus.

2. **Guthaben-Fehler im Autopilot (Factory API 402):**
   Der Factory-Autopilot-Timer bricht mit `API Error: 402 Insufficient Balance` ab. Dies deutet auf fehlende Credits beim konfigurierten Provider hin. Wir dokumentieren die Schritte zur Überprüfung der API-Keys in `~/.config/factory/autopilot.env` und das Vorgehen zum Aufladen bzw. Ändern des Modells.

3. **Fehlende MCP ticket-mcp Schemas:**
   Mehrere MCP-Tools (darunter `stage_plan`, `get_mishap_buffer`, `flush_mishap_buffer`, `archive_plan`, `record_phase_event` etc.) sind zwar im Go-Quellcode von `ticket-mcp` implementiert, fehlen aber in den statischen JSON-Schemas der Antigravity/Gemini-CLI unter `/home/patrick/.gemini/antigravity-cli/mcp/ticket-mcp/`. Dadurch kann der Client diese Tools nicht lazy laden. Wir legen alle fehlenden JSON-Schemas an und kompilieren das Go-Binary neu.

## Requirements

### R1: Database Schema Alignment
- The database tables `tickets.tickets` in both namespaces (`workspace` and `workspace-korczewski`) must have the columns `scout_drift` (NUMERIC) and `scout_drift_at` (TIMESTAMPTZ) added.
- The existing migration script `scripts/migrations/2026-06-17-scout-drift.sql` must be successfully applied.

### R2: Autopilot API Configuration Guidance
- The operator must be provided with clear instructions to check/recharge API credits in `~/.config/factory/autopilot.env`.
- Alternatively, routing to a model/provider with sufficient credits must be documented.

### R3: MCP ticket-mcp Schemas
- The missing JSON schema definition files must be present under `/home/patrick/.gemini/antigravity-cli/mcp/ticket-mcp/`.
- The Go-binary `/home/patrick/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go` must be rebuilt using the Go source files to ensure all registered Go handlers match the schemas.

## Scenarios

### Scenario 1: Applying the Scout Drift Database Migration
Given the database tables do not have `scout_drift` columns
When the migration `scripts/migrations/2026-06-17-scout-drift.sql` is executed on both namespaces `workspace` and `workspace-korczewski`
Then the tables must contain `scout_drift` and `scout_drift_at` and `cmd_set_scout_drift` from `scripts/ticket.sh` must execute without SQL column errors.

### Scenario 2: Registering all Go Tools in lazy-load MCP folder
Given the antigravity-cli lazy MCP tool folder `/home/patrick/.gemini/antigravity-cli/mcp/ticket-mcp/` is missing schemas for `stage_plan`, `get_mishap_buffer`, `flush_mishap_buffer`, `archive_plan`, `record_phase_event`, `create_ticket`, `enqueue_ticket`, `set_touched_files`, `get_attachments`, `add_pr_link`, `record_grill_answers`
When these json files are written to the folder and the Go binary is built
Then all these tools must be visible and callable via the MCP client.
