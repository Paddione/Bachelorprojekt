## ADDED Requirements

### Requirement: product_id parameter on feature creation

The ticket creation path (`ticket.sh create` and the `create_ticket` / `prepare_feature`
ticket-mcp tools) SHALL accept an optional `product_id` argument that references an existing
`type='project'` ticket. When supplied and valid, the created (or prepared) ticket's `parent_id`
SHALL be set to that project's UUID. The parameter remains optional; omitting it leaves
`parent_id` NULL and preserves the pre-existing behaviour.

#### Scenario: Valid product_id links the feature

- **GIVEN** an active project ticket `P` in brand `mentolder`
- **WHEN** a feature is created with `--product-id <P>` in brand `mentolder`
- **THEN** the new ticket is inserted with `parent_id = P.id`

#### Scenario: Non-project product_id is rejected

- **GIVEN** a ticket `T` whose `type` is not `project` (e.g. `task`)
- **WHEN** a feature is created with `--product-id <T>`
- **THEN** the command fails with the error `product_id must reference a project ticket`
  and no ticket is inserted

#### Scenario: Cross-brand product_id is rejected

- **GIVEN** a project ticket `P` in brand `korczewski`
- **WHEN** a feature is created with `--brand mentolder --product-id <P>`
- **THEN** the command fails because `P` belongs to a different brand and no ticket is inserted

### Requirement: Backfill of existing parentless features into a product taxonomy

The system SHALL provide an idempotent one-shot backfill that (a) ensures an active 7-item
product taxonomy (`type='project'`, `status='in_progress'`) exists per brand and (b) assigns a
`parent_id` to every existing parentless feature according to a pre-generated mapping file.
Re-running the backfill SHALL NOT create duplicate project tickets nor overwrite any already-set
`parent_id`.

#### Scenario: First apply run links all mapped features

- **GIVEN** parentless `type='feature'` tickets and a mapping file assigning each a product slug
- **WHEN** the backfill script runs with `--apply`
- **THEN** each mapped feature receives a `parent_id` pointing at the same-brand project ticket
  for its slug, and every project slug ticket exists

#### Scenario: Second apply run is a no-op

- **GIVEN** the backfill has already been applied once
- **WHEN** the backfill script runs again with `--apply`
- **THEN** no project tickets are created and no `parent_id` is changed (zero-diff, idempotent)

### Requirement: Admin API parent validation consistency

`createAdminTicket` in `website/src/lib/tickets/admin.ts` SHALL reject a `parentId` that does not
resolve to a `type='project'` ticket in the same brand, matching the validation enforced by the
CLI/MCP creation path.

#### Scenario: parentId to a non-project ticket is rejected

- **GIVEN** a `parentId` that resolves to a same-brand ticket whose `type` is not `project`
- **WHEN** `createAdminTicket` is called with that `parentId`
- **THEN** it throws `createAdminTicket: parentId must reference a project ticket`
