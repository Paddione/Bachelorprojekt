# Delta: factory_ask — Tool-Call-Konversion

## ADDED Requirements

### Requirement: factory_ask converts raw model tool-call syntax into executed read-only tool results

The system SHALL detect raw tool-call syntax (e.g. `<|tool_call|>call:factory_status{}<tool_call|>`) in the model answer of `factory_ask` and, when the referenced tool is on the read-only allowlist (`factory_status`, `factory_queue`), SHALL execute that tool and return its result as the answer with `source="tool_call"`.

#### Scenario: Model emits tool-call for a read-only tool

- **GIVEN** `factory_ask` receives a question about factory state
- **WHEN** the model answer contains `<|tool_call|>call:factory_status{}<tool_call|>`
- **THEN** `factory_status` is executed and its result is returned as the answer
- **AND** the response marks `source="tool_call"`

### Requirement: factory_ask never auto-executes side-effecting tools

The system SHALL NOT execute referenced tools outside the read-only allowlist — notably `factory_enqueue` and `factory_trigger` — and SHALL instead return a plain-text note naming the intended tool and instructing the caller to invoke it directly.

#### Scenario: Model emits tool-call for a side-effecting tool

- **GIVEN** the model answer references `factory_enqueue` via raw tool-call syntax
- **WHEN** `factory_ask` processes the answer
- **THEN** no tool is executed
- **AND** the answer names `factory_enqueue` and instructs the caller to invoke it directly

### Requirement: factory_ask system prompt forbids raw tool-call emission

The system SHALL instruct the model to never emit raw tool-call syntax and to name tools inline as plain text.

#### Scenario: Prompt hardening is in place

- **GIVEN** a `factory_ask` question
- **WHEN** the system prompt is built
- **THEN** it contains an explicit prohibition of raw tool-call syntax
