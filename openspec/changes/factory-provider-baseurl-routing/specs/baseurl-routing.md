## ADDED Requirements

### Requirement: Provider BaseURL Passthrough for Local Providers

The factory pipeline SHALL pass through custom `baseUrls` when using local
providers, enabling custom LLM endpoints to be used with the agent harness.

#### Scenario: Local provider uses custom endpoint

- **GIVEN** a local provider configuration with a custom baseUrl
- **WHEN** the factory executes an agent task
- **THEN** the request is sent to the specified baseUrl instead of hardcoded endpoints
