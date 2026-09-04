## ADDED Requirements

### Requirement: Alias Usage Telemetry for the FreeToken Plugin

The `freetoken-active.ts` plugin SHALL append one JSON Lines record per
outgoing chat-completion request to a local telemetry file. Each record SHALL
carry the request timestamp, the requested model alias exactly as the caller
sent it (`active`, `active-thinking`, or `active-fast`), and the size of the
assembled prompt.

The telemetry file SHALL live outside the repository working tree, alongside
the existing FreeToken logs, so that measurement data never enters a commit.

Writing telemetry SHALL be fire-and-forget: a failure to open, write, or flush
the telemetry file SHALL NOT alter the outgoing request, delay it, or surface
an error to the caller.

Rationale: since T014028 the `freetoken-local` provider targets
`http://127.0.0.1:1919/v1` directly, bypassing the local proxy on `:18235` that
writes `tickets.llm_proxy_request_log`. No FreeToken request has been recorded
since. The plugin is the only component that observes the real request body, and
it already branches on the alias to inject `enable_thinking` — so it is the
single place where both the alias distribution and the true prompt sizes can be
captured. Without those two numbers, neither the value of the Dynamic Thinking
Pool nor the actually required context window can be established, and any
backend decision rests on assumption rather than measurement (T900087, T002717).

#### Scenario: A thinking request is recorded under its own alias

- **GIVEN** the plugin processes a request whose model is `active-thinking`
- **WHEN** the telemetry record for that request is read back
- **THEN** its alias field is `active-thinking`
- **AND** it carries a prompt size and a timestamp

#### Scenario: A non-thinking request is recorded under its own alias

- **GIVEN** the plugin processes a request whose model is `active-fast`
- **WHEN** the telemetry record for that request is read back
- **THEN** its alias field is `active-fast`

#### Scenario: Telemetry never lives inside the working tree

- **GIVEN** the configured telemetry file path
- **WHEN** the path is compared against the repository root
- **THEN** it does not resolve to a location inside the working tree

#### Scenario: A telemetry failure leaves the request untouched

- **GIVEN** the telemetry file cannot be written
- **WHEN** the plugin processes a chat-completion request
- **THEN** the outgoing request body is unchanged from the case where telemetry
  succeeds
- **AND** no error is raised to the caller
