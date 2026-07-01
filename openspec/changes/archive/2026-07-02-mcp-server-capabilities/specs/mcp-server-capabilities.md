## ADDED Requirements

### Requirement: mcp-task-runner exposes async task lifecycle tools

The `mcp-task-runner` server SHALL expose `run_task_async`, `cancel_task`, and `get_task_result` tools for non-blocking asynchronous task execution. A `JobRegistry` tracks running jobs by UUID, allowing cancellation via SIGTERM with a 5-second SIGKILL fallback.

#### Scenario: Async task returns job_id immediately

- **GIVEN** a valid task name and optional env
- **WHEN** `run_task_async` is called
- **THEN** a non-empty `job_id` is returned immediately and the task runs in a background goroutine

#### Scenario: Cancel running job

- **GIVEN** a running async job
- **WHEN** `cancel_task` is called with the job_id
- **THEN** SIGTERM is sent to the process; the job is marked cancelled

### Requirement: mcp-task-runner exposes task graph visualization

The `mcp-task-runner` server SHALL expose `get_task_graph` to return the full Taskfile DAG in Mermaid format (default) or JSON. Output MUST be deterministically ordered.

#### Scenario: Mermaid output with node sanitization

- **GIVEN** a Taskfile with tasks containing colons or hyphens in names
- **WHEN** `get_task_graph` is called with format=mermaid
- **THEN** node IDs have special chars replaced with `_` while labels retain originals

### Requirement: ticket-mcp exposes directed ticket dependency links

The `ticket-mcp` server SHALL expose `link_tickets` and `get_ticket_links` tools. Links are typed as `blocks` or `relates`, stored idempotently in `tickets.ticket_links`, and readable as JSON `{blocks, blocked_by, relates}`.

#### Scenario: Idempotent link creation

- **GIVEN** two valid ticket external_ids and kind=blocks
- **WHEN** `link_tickets` is called multiple times with the same arguments
- **THEN** only one row exists in `tickets.ticket_links` (ON CONFLICT DO NOTHING)

### Requirement: ticket-mcp exposes full ticket history export

The `ticket-mcp` server SHALL expose `export_ticket_timeline` returning a chronological JSON of all ticket events from 4 sources: `ticket_comments`, `factory_phase_events`, `ticket_links` (kind=pr), and `ticket_plans` (archived only).

#### Scenario: Offline read refusal

- **GIVEN** `TICKET_OFFLINE=1` is set
- **WHEN** `get-timeline` is called via ticket.sh
- **THEN** exit code 9 is returned without touching the cluster
