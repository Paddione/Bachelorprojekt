# routing-check-freetoken-t014552

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu routing-check-freetoken-t014552 ergänzen._

## Requirements

### Requirement: Routing checks use only enabled provider configurations

The routing check SHALL validate enabled local provider configurations and SHALL ignore
provider configurations that have been disabled after a backend migration.

#### Scenario: Disabled legacy backend does not produce routing drift

- **GIVEN** a provider configuration for `gemma12-vision` at `http://127.0.0.1:18235`
  is disabled and the FreeToken backend is available at `http://127.0.0.1:1919`
- **WHEN** the routing check runs
- **THEN** it SHALL not report `gemma12-vision` as a missing local backend

<!-- merged from change delta routing-check-freetoken-t014552.md (8debb4dea69f) -->