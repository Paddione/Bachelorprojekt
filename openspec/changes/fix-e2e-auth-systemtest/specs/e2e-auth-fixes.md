## MODIFIED Requirements

### Requirement: E2E Auth Token Refresh

The E2E auth flow SHALL refresh tokens reliably without returning 401 errors during system tests.

#### Scenario: Auth token refresh succeeds

- **GIVEN** an E2E test session with an expiring auth token
- **WHEN** the auth token approaches expiration
- **THEN** the token SHALL be refreshed before the next API call

#### Scenario: System-test handles 401 gracefully

- **GIVEN** a system test runner making authenticated API calls
- **WHEN** a 401 response is received
- **THEN** the runner SHALL retry with a fresh token

### Requirement: Talk Selector for iOS E2E

The talk selector SHALL work correctly in iOS E2E tests.

#### Scenario: iOS talk selector works

- **GIVEN** an iOS E2E test session
- **WHEN** the talk selector is used
- **THEN** the correct talk SHALL be selected

### Requirement: Reliable Playwright CI Configuration

The Playwright configuration SHALL be tuned for reliable CI execution.

#### Scenario: CI Playwright runs are stable

- **GIVEN** a CI environment running Playwright E2E tests
- **WHEN** tests are executed
- **THEN** they SHALL complete without timeout or flaky failures
