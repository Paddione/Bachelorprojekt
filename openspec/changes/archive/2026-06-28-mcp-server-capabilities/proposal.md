## Why

Die selbst gebauten MCP-Server (`mcp-task-runner`, `ticket-mcp`) bieten bisher nur grundlegende Operationen. Laufende Tasks können nicht abgebrochen werden, die Task-Abhängigkeitsstruktur ist nicht sichtbar, Ticket-Dependencies sind nur als informelles Textfeld (`depends_on TEXT[]`) modelliert, und die vollständige Ticket-History ist nicht maschinenlesbar abrufbar — was Debugging und Automatisierung im Software-Factory-Workflow erschwert.

## What Changes

- **mcp-task-runner** erhält drei neue Tools für asynchrone Task-Ausführung:
  - `run_task_async` — startet Task im Hintergrund, gibt sofort eine `job_id` zurück
  - `cancel_task` — bricht einen laufenden Task via `job_id` ab (SIGTERM → SIGKILL)
  - `get_task_result` — pollt Status und Output eines async Tasks
- **mcp-task-runner** erhält ein neues Tool zur Dependency-Visualisierung:
  - `get_task_graph` — gibt den Task-DAG als Mermaid (default) oder JSON zurück
- **ticket-mcp** erhält zwei neue Tools für strukturierte Ticket-Dependencies:
  - `link_tickets` — erstellt `blocks`/`relates`-Links zwischen Tickets
  - `get_ticket_links` — gibt alle Links eines Tickets zurück (`blocks`, `blocked_by`, `relates`)
- **ticket-mcp** erhält ein neues Tool für History-Export:
  - `export_ticket_timeline` — exportiert die vollständige Ticket-History als chronologisches JSON
- Bestehende Tools (`run_task`, `execute_plan`, alle 15 ticket-mcp-Tools) bleiben unverändert — reine Erweiterung, keine Breaking Changes

## Capabilities

### New Capabilities

- `task-runner-async`: Asynchrone Task-Ausführung mit Cancel-Support in mcp-task-runner — JobRegistry, `run_task_async`, `cancel_task`, `get_task_result`
- `task-runner-graph`: Task-Dependency-Visualisierung in mcp-task-runner — `get_task_graph` mit Mermaid/JSON-Output
- `ticket-linking`: Strukturierte Ticket-Dependencies in ticket-mcp — `link_tickets`, `get_ticket_links`, DB-Constraint-Erweiterung
- `ticket-timeline`: Maschinenlesbarer Ticket-History-Export in ticket-mcp — `export_ticket_timeline` mit UNION aus 4 Quellen

### Modified Capabilities

- `mcp-task-runner`: Neue Tools werden zur bestehenden Spec hinzugefügt (keine Behavior-Änderung bestehender Tools)

## Impact

- **mcp-task-runner/**: `runner/registry.go` (neu), `runner/executor.go` (+`StartTask()`), `planner/graphviz.go` (neu), `main.go` (+4 Handler)
- **scripts/ticket-mcp/go/**: `internal/tools/links.go` (neu), `internal/tools/list.go` (+Timeline-Handler), `cmd/ticket-mcp/main.go` (+`RegisterLinkTools()`)
- **scripts/lib/ticket-links.sh**: +`cmd_link_tickets`, `cmd_get_ticket_links`
- **scripts/ticket.sh**: +`cmd_get_timeline`, case-Dispatch-Einträge
- **scripts/datamodel/**: Neue idempotente Migration für `ticket_links.kind` CHECK-Constraint
- **PostgreSQL**: `tickets.ticket_links`-Tabelle (existiert bereits) — CHECK-Constraint um `'blocks'`, `'relates'` erweitert
- Keine neuen Kubernetes-Manifeste, keine neuen externen Abhängigkeiten, keine Breaking Changes
