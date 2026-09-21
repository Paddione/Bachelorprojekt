## ADDED Requirements

### Requirement: Application Pipeline Dynamic API Routes

The system SHALL provide internal API routes for individual applications parameterized by ID under `/api/internal/applications/[id]/`.

#### Scenario: Requesting job details by ID
- **GIVEN** a job exists with ID `68` in `applications.jobs`
- **WHEN** an authorized GET request is made to `/api/internal/applications/68/detail`
- **THEN** the server returns status 200 with the job details JSON payload
