## ADDED Requirements

### Requirement: Tickets can be linked with a dependency kind
The system SHALL provide a `link_tickets` tool that creates a directed dependency link between two tickets. Supported kinds are `blocks` (A prevents B from proceeding) and `relates` (soft association). The operation SHALL be idempotent — calling it multiple times with the same arguments has no additional effect.

#### Scenario: Create a blocks link
- **WHEN** a caller invokes `link_tickets` with `from=T000100`, `to=T000200`, `kind=blocks`
- **THEN** a `blocks` link from T000100 to T000200 is recorded in the database and a success message is returned

#### Scenario: Idempotent creation
- **WHEN** a caller invokes `link_tickets` with the same `from`, `to`, `kind` a second time
- **THEN** the tool returns a success message without creating a duplicate link

#### Scenario: Invalid kind value
- **WHEN** a caller invokes `link_tickets` with `kind=depends` (not in the allowed set)
- **THEN** the tool returns an error before any database write

#### Scenario: Unknown ticket ID
- **WHEN** a caller invokes `link_tickets` with a `from` or `to` that does not match any ticket's `external_id`
- **THEN** the tool returns an error indicating the ticket was not found

### Requirement: All dependency links of a ticket are retrievable
The system SHALL provide a `get_ticket_links` tool that returns all links for a ticket grouped by direction: tickets it blocks, tickets that block it (`blocked_by`), and tickets it relates to.

#### Scenario: Get links for a ticket that blocks others
- **WHEN** a caller invokes `get_ticket_links` with `id=T000100` and T000100 blocks T000200
- **THEN** the tool returns `{"blocks": ["T000200"], "blocked_by": [], "relates": []}`

#### Scenario: Blocked-by is derived without a separate DB entry
- **WHEN** T000050 blocks T000100 (stored as a single row in the direction from T000050 to T000100)
- **THEN** `get_ticket_links(T000100)` returns `{"blocked_by": ["T000050"], ...}` via reverse query — no second DB row is needed

#### Scenario: Relates is symmetric
- **WHEN** a `relates` link exists between T000100 and T000300 (stored as one row)
- **THEN** both `get_ticket_links(T000100)` and `get_ticket_links(T000300)` include the other ticket under `relates`

#### Scenario: Ticket with no links
- **WHEN** a caller invokes `get_ticket_links` for a ticket with no links
- **THEN** the tool returns `{"blocks": [], "blocked_by": [], "relates": []}`
