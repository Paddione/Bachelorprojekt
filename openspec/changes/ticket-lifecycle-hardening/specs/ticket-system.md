## ADDED Requirements

### Requirement: DELETE on tickets.tickets writes an audit entry

The audit trigger `trg_tickets_audit_log` on `tickets.tickets` SHALL also fire on
DELETE (it currently covers INSERT/UPDATE only). A DELETE SHALL write one
`tickets.ticket_activity` row with field `_deleted` and the full OLD row as
`old_value`, so removed non-test-data rows leave a trace (incident T015005: row
T014936 vanished without any audit entry).

#### Scenario: Delete leaves an audit trail

- **GIVEN** a non-test-data ticket row in `tickets.tickets`
- **WHEN** the row is deleted via SQL
- **THEN** a `ticket_activity` entry with `field='_deleted'` exists for it
- **AND** `old_value` contains the deleted row's `external_id` and `title`

#### Scenario: Insert and update behavior is unchanged

- **GIVEN** the trigger change is deployed
- **WHEN** a ticket is inserted or updated
- **THEN** the existing `_created` / `_updated` activity entries are written as before
