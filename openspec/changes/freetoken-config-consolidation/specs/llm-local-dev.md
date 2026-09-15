## MODIFIED Requirements

### Requirement: Project Default Model Targets the FreeToken Alias

The project opencode config `.opencode/opencode.jsonc` SHALL declare
`llamacpp-local/qwen38-220k` as its top-level default `model`. It SHALL NOT declare a default
that resolves to the retired FreeToken-native engine (`freetoken-local/*`).

Rationale: FreeToken (Windows-native, port 1919) is decommissioned by operator decision
(T900164). `llamacpp-local/qwen38-220k` is `enabled: true` in `scripts/llm/loadouts.json` and
served through the llm-proxy on `:18235`, which already carries every re-routed agent from
`.opencode/agent-models.jsonc` (T900163). A project default naming the retired engine boots
against a dead backend.

#### Scenario: Default model resolves to the qwen38-220k loadout

- **GIVEN** `.opencode/opencode.jsonc` declares its top-level `model`
- **WHEN** the value is read
- **THEN** it equals `llamacpp-local/qwen38-220k`
