## ADDED Requirements

### Requirement: Systemtest Purge Endpoint Positive Assertion

The E2E test suite SHALL verify systemtest infrastructure routes under `/sdlc/api/systemtest/` using explicit positive status assertions (such as 403 Forbidden when unauthenticated) rather than negative status assertions.

#### Scenario: Unauthenticated request to purge endpoint returns 403

- **GIVEN** the application systemtest endpoint `/sdlc/api/systemtest/purge-all-test-data` is deployed
- **WHEN** an unauthenticated POST request is sent to the endpoint
- **THEN** the server returns HTTP status 403 Forbidden
