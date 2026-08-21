## ADDED Requirements

### Requirement: E2E Playwright Suite Path Alignment & Flag Resilience

The E2E test suite SHALL target valid Astro deployment routes (`/sdlc/systemtest/board`, `/sdlc/api/systemtest/board`) and gracefully respect deployment feature flags.

#### Scenario: System-test board route access

- **GIVEN** an admin user in an E2E test session
- **WHEN** the system-test board route is accessed
- **THEN** it either loads the kanban columns or navigates to the feature-disabled notice without uncaught 404s

