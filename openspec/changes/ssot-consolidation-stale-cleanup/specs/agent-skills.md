## MODIFIED Requirements

### Requirement: Active Agent Roster without FreeToken
The system SHALL remove all FreeToken provider configurations and obsolete agent routing entries from the active agent definitions and SSOT specifications.

#### Scenario: Agent routing omits FreeToken
- **GIVEN** the active agent routing configuration
- **WHEN** resolving available agent providers
- **THEN** FreeToken models SHALL NOT be present or selectable.
