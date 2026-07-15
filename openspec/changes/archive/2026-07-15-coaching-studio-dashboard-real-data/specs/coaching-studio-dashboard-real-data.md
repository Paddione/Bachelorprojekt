# coaching-studio-dashboard-real-data — Delta

## ADDED Requirements

### Requirement: Coaching Studio Dashboard MUST load real sessions from the database

The Coaching Studio Dashboard SHALL query the database via the `/api/admin/coaching/sessions` endpoint to load and display real customer sessions instead of placeholder data.

#### Scenario: Loading the dashboard fetches real sessions from database

- **GIVEN** a user is logged into the Coaching Studio Dashboard
- **WHEN** the dashboard mounts
- **THEN** it fetches real session data from the API endpoint and populates the dashboard view
