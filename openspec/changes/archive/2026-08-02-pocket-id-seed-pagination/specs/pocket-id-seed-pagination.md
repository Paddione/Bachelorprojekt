## ADDED Requirements

### Requirement: pocket-id-client-seed SHALL search all pages of oidc_clients

The `find_client_id()` lookup in the `pocket-id-client-seed` job SHALL search
every page of Pocket-ID's `GET /api/oidc/clients` response, not only the
first page, before concluding that a named client does not exist.

#### Scenario: client exists past the first page

- **GIVEN** the `oidc_clients` table holds more than 20 rows (the
  server-enforced `itemsPerPage` cap)
- **AND** the client named `<app>` is not among the first 20 rows returned
- **WHEN** `find_client_id "<app>"` runs
- **THEN** it returns the existing client's id from a later page
- **AND** the seed job does NOT create a duplicate client row for `<app>`

#### Scenario: client genuinely does not exist

- **GIVEN** no row in `oidc_clients`, on any page, has `name == "<app>"`
- **WHEN** `find_client_id "<app>"` runs through all pages reported by
  `totalPages`
- **THEN** it returns an empty string, matching prior "not found" behavior
