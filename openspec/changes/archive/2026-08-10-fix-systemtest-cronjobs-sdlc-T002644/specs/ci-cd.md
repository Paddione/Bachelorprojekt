## MODIFIED Requirements

### Requirement: Systemtest Failure-Loop CronJobs Route Targets

The systemtest failure-loop CronJobs SHALL target the correct `/sdlc/api/systemtest/*` HTTP endpoints on the website service.

#### Scenario: CronJobs trigger correct SDLC API endpoints
- **GIVEN** the in-cluster CronJobs `systemtest-cleanup`, `systemtest-purge-all`, and `systemtest-outbox`
- **WHEN** the CronJobs execute curl POST requests against `http://website.${WEBSITE_NAMESPACE}.svc.cluster.local`
- **THEN** they call `/sdlc/api/systemtest/cleanup-fixtures`, `/sdlc/api/systemtest/purge-all-test-data`, and `/sdlc/api/systemtest/drain-outbox` respectively instead of obsolete `/api/admin/systemtest/*` endpoints.
