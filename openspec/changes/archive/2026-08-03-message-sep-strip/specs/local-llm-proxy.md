## ADDED Requirements

### Requirement: Turn markers are stripped from non-streaming content

The proxy SHALL remove known chat-template turn markers (`<|message_sep|>`, `<|role_sep|>`)
from the `content` field of non-streaming chat completions before delivering them, and SHALL
adjust `content-length` accordingly. Streaming responses SHALL pass through unchanged.

Stripping SHALL apply only to the `content` field. `tool_calls` and every other field SHALL be
delivered unchanged, because the tool-call path already consumes the marker and yields an empty
`content`.

An answer that contains no marker SHALL be delivered byte-identical to the upstream body.

#### Scenario: Marker is removed from a plain-text answer

- **GIVEN** the backend answers a non-streaming request with `content` `"Paris<|message_sep|>"`
- **WHEN** the proxy delivers the response
- **THEN** the client receives `content` `"Paris"` and an unchanged `finish_reason`

#### Scenario: Tool-call responses are untouched

- **GIVEN** the backend answers with `content` `""`, populated `tool_calls` and
  `finish_reason` `tool_calls`
- **WHEN** the proxy delivers the response
- **THEN** `tool_calls` is delivered unchanged and `content` stays `""`

#### Scenario: Streaming responses pass through

- **GIVEN** the request carries `stream: true`
- **WHEN** the proxy delivers the response
- **THEN** the body is piped through unchanged, markers included
