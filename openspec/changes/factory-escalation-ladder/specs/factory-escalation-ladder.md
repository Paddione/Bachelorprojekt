## ADDED Requirements

### Requirement: Progressive Model Escalation

The system SHALL progressively escalate the model reasoning capabilities used by the Software Factory pipeline upon consecutive stale timeouts.

#### Scenario: Route model configuration based on attempt count
- **GIVEN** a ticket with attempt count `N`
- **WHEN** the factory ticks and prepares the launch payload
- **THEN** the system SHALL assign the model according to the following mapping:
  - `N = 1` -> `flash` tier
  - `N = 2` -> `haiku` tier
  - `N >= 3` -> `sonnet` tier
- **AND** pass the resolved model configuration (`provider`, `modelId`, `baseUrl`) to the pipeline script.

### Requirement: Named escalation in watchdog comments

The watchdog SHALL explicitly name the escalated model tier in the comment when a ticket times out.

#### Scenario: Watchdog comment details
- **GIVEN** a stale ticket is reset by the watchdog
- **WHEN** the watchdog posts a comment to the ticket
- **THEN** the comment SHALL include the failure class, the attempt count, and the name of the next tier/model configuration that will run.
