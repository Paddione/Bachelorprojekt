## ADDED Requirements

### Requirement: Single System Message for the FreeToken Provider

Requests that opencode sends through the `llamacpp-local` provider SHALL carry at
most one `role: "system"` message, and it SHALL be the first message. The plugin
`.opencode/plugin/system-message-merge.ts` SHALL wrap
`provider["llamacpp-local"].options.fetch` and merge every `system` message of a
chat request, in original order and joined by a blank line, into one message at
position 0. All other messages SHALL keep their relative order. Array content
SHALL be flattened to text. Requests of other providers, non-JSON bodies and
requests that already satisfy the rule SHALL pass through unchanged.

Rationale: the FreeToken Qwen3.6 chat template rejects every additional system
message with "could not encode request: System message must be at the
beginning." opencode 1.18.31 sends `system,system,user` for `qwen38-primary` and
the title agent. The llm-proxy fixup (retired T900208/T900213) and the
`freetoken-active.ts` merge (removed T900203) used to absorb this (T900220).

#### Scenario: Two leading system messages are merged

- **GIVEN** the plugin's `config` hook has wrapped the `llamacpp-local` fetch
- **WHEN** a request with messages `system(A), system(B), user` is sent
- **THEN** the upstream fetch receives `system("A\n\nB"), user`

#### Scenario: A later system message moves to the front

- **GIVEN** the wrapped `llamacpp-local` fetch
- **WHEN** a request with messages `system(A), user, assistant, system(B), user` is sent
- **THEN** the upstream fetch receives `system("A\n\nB"), user, assistant, user`

#### Scenario: Other providers are untouched

- **GIVEN** the plugin's `config` hook ran on a config without `llamacpp-local`
- **WHEN** a request with two system messages is sent through another provider
- **THEN** the upstream fetch receives the messages unchanged
