## ADDED Requirements

### Requirement: Full ticket history is exportable as chronological JSON
The system SHALL provide an `export_ticket_timeline` tool that returns the complete recorded history of a ticket as a single JSON object. Events from four sources SHALL be merged and sorted chronologically: `ticket_comments`, `factory_phase_events`, `ticket_links` (kind=pr), and `ticket_plans` (archived).

#### Scenario: Export timeline for a ticket with events from all sources
- **WHEN** a caller invokes `export_ticket_timeline` with a valid ticket `id`
- **THEN** the tool returns a JSON object with a `ticket` key (metadata) and an `events` array containing all events from all four sources, ordered by timestamp ascending

#### Scenario: Event structure is consistent across sources
- **WHEN** the timeline is returned
- **THEN** every event in the `events` array has the keys `source` (one of `comment`, `phase_event`, `pr_link`, `plan_archived`), `ts` (ISO 8601 timestamp), and `detail` (source-specific JSON object)

#### Scenario: Ticket with no events
- **WHEN** a caller invokes `export_ticket_timeline` for a ticket that has no comments, phase events, PR links, or archived plans
- **THEN** the tool returns the `ticket` metadata with an empty `events` array

#### Scenario: Unknown ticket ID
- **WHEN** a caller invokes `export_ticket_timeline` with an `id` that does not match any ticket
- **THEN** the tool returns an error indicating the ticket was not found

### Requirement: Known limitation of CLI status transitions is documented
The system SHALL document that status transitions performed via the CLI (`ticket.sh update-status`) do NOT appear in the timeline, because `update-status.sh` does not write `ticket_comments` entries. Status transitions performed via the website TypeScript path DO appear as `kind=status_change` comments.

#### Scenario: CLI status change not in timeline
- **WHEN** a ticket's status is changed via `ticket.sh update-status`
- **THEN** the timeline does NOT contain a corresponding event for this transition (known limitation — follow-up ticket required)
