## MODIFIED Requirements

### Requirement: Project Default Model Targets the FreeToken Alias

The project opencode config `.opencode/opencode.jsonc` SHALL declare
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4` as its top-level default `model`. It SHALL NOT declare a
default that resolves to the retired llama.cpp loadout `llamacpp-local/qwen38-220k`
(port 8094, no longer served).

Rationale: FreeToken (Windows-native, port 1919) was re-established as the local inference
backend by operator decision (T900189), served through the llm-proxy on `:18235`.
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4` (200000 served KV, moe 4150) is the active model alias
that resolves to that backend and is declared in `.opencode/agent-models.jsonc` for every
re-routed agent. A project default naming the retired llama.cpp loadout boots against a dead
backend.

#### Scenario: Default model resolves to the Qwen3.6-35B-A3B-NVFP4 alias

- **GIVEN** `.opencode/opencode.jsonc` declares its top-level `model`
- **WHEN** the value is read
- **THEN** it equals `llamacpp-local/Qwen3.6-35B-A3B-NVFP4`
