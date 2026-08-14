## ADDED Requirements

### Requirement: Single-command local environment lifecycle

The platform SHALL provide unified orchestration commands to start and stop the complete local SDLC stack via `task dev:up` and `task dev:down`.

#### Scenario: Start complete local environment

- **GIVEN** local prerequisites (Docker, kubectl, Task) are met
- **WHEN** the user executes `task dev:up`
- **THEN** the local cluster, llm-proxy, vector backend, and database are started and verified

#### Scenario: Stop local environment cleanly

- **GIVEN** a running local SDLC environment
- **WHEN** the user executes `task dev:down`
- **THEN** all associated local services and containers are stopped cleanly
