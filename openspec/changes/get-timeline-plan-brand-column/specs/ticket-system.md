## ADDED Requirements

### Requirement: `get-timeline` liefert die Plan-Historie ohne Query-Fehler

`bash scripts/ticket.sh get-timeline --id <external_id>` SOLL für ein Ticket
mit einem archivierten Plan Exit 0 liefern und einen `plan_archived`-Eintrag
in der Timeline enthalten. Die `plan_events`-CTE darf `tickets.ticket_plans`
NICHT auf eine nicht existierende Spalte (`tp.brand`) filtern — die
Brand-Eingrenzung erfolgt bereits transitiv über den
Ticket-`external_id`-Subselect, der pro Brand eindeutig ist.

#### Scenario: `get-timeline` for a ticket with an archived plan returns the plan_archived event

- **GIVEN** a ticket (e.g. T900110, brand mentolder) has an archived plan (`ticket_plans.archived_at IS NOT NULL`)
- **WHEN** `bash scripts/ticket.sh get-timeline --id T900110` is run
- **THEN** the command exits 0 and the JSON output contains an event with `source = "plan_archived"`
