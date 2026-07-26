## ADDED Requirements

### Requirement: Public and admin API endpoints return the documented status code under E2E load

The system SHALL return the HTTP status code documented by each endpoint's
own contract (validation, not-found, conflict, or auth-gate) for every one
of the following request shapes, independent of prior requests made
against unrelated endpoints in the same test run:

- `GET /api/status?id=<non-existent T-id>` SHALL return `404` (or the
  endpoint's documented rate-limit `429` only when that IP has genuinely
  exceeded its own request budget on `/api/status`, never as a side
  effect of unrelated endpoint traffic).
- `POST /api/booking` with a `slotStart`/`slotEnd` outside every
  admin-configured availability window SHALL return `409` with an error
  message containing "verfügbar".
- `POST /api/meeting/finalize` with a valid `customerName` +
  `customerEmail` payload on a brand whose meetings schema is
  provisioned (mentolder) SHALL return `200` with
  `{ success: true, results: [...] }`.
- `GET /admin/clients` without an authenticated session SHALL return
  `401` or `403`, never `200` or a `5xx`.
- `GET /admin/knowledge/snippets/<random-uuid>/publish` for a
  non-existent snippet SHALL return a status code below `500` (graceful
  not-found handling, not an unhandled exception).

#### Scenario: /api/status 404 for a non-existent ticket is not masked by unrelated rate-limit consumption

- **GIVEN** the E2E suite has made unrelated requests to other API routes
  earlier in the same run
- **WHEN** a client requests `GET /api/status?id=BR-20260101-0000` (a
  well-formed but non-existent ticket ID) and that client's own
  `/api/status` request count is under the endpoint's limit
- **THEN** the response status is `404`, not `429`

#### Scenario: Booking rejects a slot outside every configured window

- **GIVEN** no admin-configured availability window covers
  `2020-01-01T07:00:00.000Z`–`2020-01-01T08:00:00.000Z`
- **WHEN** a client POSTs `/api/booking` with that slot and otherwise
  valid fields
- **THEN** the response status is `409` and the JSON body's `error`
  field contains "verfügbar"

#### Scenario: Meeting finalize succeeds on a brand with a provisioned meetings schema

- **GIVEN** the request targets the mentolder brand, whose meetings
  schema is provisioned
- **WHEN** a client POSTs `/api/meeting/finalize` with a valid
  `customerName` and `customerEmail`
- **THEN** the response status is `200` and the JSON body has
  `success: true` and an array `results`

#### Scenario: Admin clients list is gated without auth

- **GIVEN** the request carries no authenticated admin session
- **WHEN** a client requests `GET /admin/clients`
- **THEN** the response status is `401` or `403`

#### Scenario: Publishing a non-existent knowledge snippet fails gracefully

- **GIVEN** `<random-uuid>` does not correspond to any row in the
  knowledge snippets table
- **WHEN** a client requests
  `GET /admin/knowledge/snippets/<random-uuid>/publish`
- **THEN** the response status is below `500` (e.g. a redirect, `404`, or
  a rendered error page — not an unhandled server exception)
