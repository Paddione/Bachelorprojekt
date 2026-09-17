## ADDED Requirements

### Requirement: Internal Cross-Service API for Application Pipeline Data

The website service SHALL expose an internal, token-gated API for reading and appending to
`applications.*` data, so the Brett cockpit (a separate service with its own database) can render
the application funnel without a second direct database connection.

#### Scenario: Authorized internal request lists applications grouped by status

- **GIVEN** a caller presenting the correct `x-internal-token` header matching `INTERNAL_API_TOKEN`
- **WHEN** it requests `GET /api/internal/applications/list`
- **THEN** the response groups active applications by lifecycle status (`found`, `drafting`,
  `applied`, `interviewing`, `offered`) with job id, company, role, and dossier count per entry

#### Scenario: Unauthorized request is rejected

- **GIVEN** a caller with a missing or incorrect `x-internal-token` header
- **WHEN** it requests `GET /api/internal/applications/list` or
  `POST /api/internal/applications/timeline`
- **THEN** the request is rejected with HTTP 403 and no application data is returned or written
