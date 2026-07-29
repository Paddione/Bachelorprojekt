## ADDED Requirements

### Requirement: Release notes generator enriches LLM prompt with ticket context

`scripts/vda/release-notes.sh` MUST extract ticket IDs matching `[T00XXXX]` from merged PR titles and fetch ticket details via `bash scripts/ticket.sh get --id <TICKET_ID>`. When valid ticket data is returned, it MUST append a `[TICKET_CONTEXT]` block to the prompt containing ticket ID, type, title, areas, and description.

#### Scenario: PR title contains ticket ID tag
- **GIVEN** a PR title containing `[T002403]`
- **WHEN** release notes narrative generation runs
- **THEN** ticket details are loaded and included in `[TICKET_CONTEXT]` in the prompt

#### Scenario: Ticket query fails or PR has no tag
- **GIVEN** a PR title without a ticket tag OR a failing ticket query
- **WHEN** release notes narrative generation runs
- **THEN** execution proceeds gracefully without adding ticket context or failing the script
