## ADDED Requirements

### Requirement: pocket-id-client-seed SHALL abort early on invalid API key

The `pocket-id-client-seed` job SHALL verify its `POCKET_ID_API_KEY` against
the Pocket-ID admin API before processing any client row, and SHALL abort
immediately (no client create/update attempts) if that check returns HTTP
401 or 403.

#### Scenario: API key is invalid

- **GIVEN** `POCKET_ID_API_KEY` no longer matches a valid admin key in
  Pocket-ID's `api_keys` table
- **WHEN** the seed job runs
- **THEN** the up-front auth check receives HTTP 401 or 403
- **AND** the job exits with a clear error before any `upsert()` call runs
- **AND** no new `oidc_clients` row is created for any app

#### Scenario: API key is valid

- **GIVEN** `POCKET_ID_API_KEY` matches a valid admin key
- **WHEN** the seed job runs
- **THEN** the up-front auth check receives HTTP 200
- **AND** the job proceeds to process `ROWS` as before
