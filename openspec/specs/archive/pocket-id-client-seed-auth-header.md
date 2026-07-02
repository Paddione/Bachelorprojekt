# pocket-id-client-seed-auth-header

## Purpose

SSOT spec.

## Requirements

### Requirement: pocket-id-client-seed authenticates against Pocket ID's admin API with X-API-KEY

The `pocket-id-client-seed` Job SHALL authenticate against Pocket ID's admin OIDC-client
endpoints (`GET/POST/PUT /api/oidc/clients*`) using the `X-API-KEY` header. It SHALL NOT use
`Authorization: Bearer`, which Pocket ID rejects for these endpoints with `401 Unauthorized`
regardless of key validity.

#### Scenario: Seed job lists existing OIDC clients

- **GIVEN** a valid, unexpired `POCKET_ID_API_KEY`
- **WHEN** the seed job calls `GET /api/oidc/clients`
- **THEN** the request uses the `X-API-KEY` header
- **AND** Pocket ID responds `200 OK` with the client list

#### Scenario: Seed job creates or updates an OIDC client

- **GIVEN** a valid, unexpired `POCKET_ID_API_KEY`
- **WHEN** the seed job calls `POST /api/oidc/clients` or `PUT /api/oidc/clients/<id>`
- **THEN** the request uses the `X-API-KEY` header
- **AND** Pocket ID accepts the request instead of returning `401 "You are not signed in"`

<!-- merged from change delta pocket-id-client-seed-auth-header.md on 2026-07-01 -->