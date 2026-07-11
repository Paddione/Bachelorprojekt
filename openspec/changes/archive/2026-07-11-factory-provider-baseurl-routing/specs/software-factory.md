## ADDED Requirements

### Requirement: Guard Against Silent Provider BaseURL Passthrough Loss

The factory pipeline's `agent()` call sites SHALL route every `model` argument
through `resolveAgentModel`, which only accepts a value from the harness tier
enum (`sonnet|opus|haiku|fable`). When a resolved provider route carries a
custom `modelId` and/or `baseUrl` that the harness cannot use, the pipeline
SHALL log the drop and fall back to a valid harness tier instead of silently
discarding local-provider routing.

#### Scenario: Local provider route is dropped with a visible fallback

- **GIVEN** a resolved provider route with a custom `modelId` and `baseUrl`
  pointing at a local endpoint
- **WHEN** the factory pipeline builds the `agent()` call options for
  `factory-scout`, `factory-plan`, `factory-implement`, or `factory-review`
- **THEN** `resolveAgentModel` logs the dropped `modelId`/`baseUrl` and returns
  the caller-supplied fallback tier, so the `agent()` call always receives a
  valid harness tier instead of an unsupported custom value

#### Scenario: Harness-tier route passes through unchanged

- **GIVEN** a resolved provider route whose `modelId` is already one of
  `sonnet|opus|haiku|fable` and has no `baseUrl`
- **WHEN** `resolveAgentModel` evaluates the route
- **THEN** it returns that `modelId` unchanged, with no fallback and no log line
