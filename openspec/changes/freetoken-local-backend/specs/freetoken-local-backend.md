## ADDED Requirements

### Requirement: FreeToken-native serves all local agent traffic

FreeToken-native (Windows-detached, OpenAI-compatible API on `127.0.0.1:1919/v1`, resident model `Qwen3.6-35B-A3B-NVFP4`, 262144 context measured) SHALL be the local backend for opencode and the local family subagents. The opencode config `.opencode/agent-models.jsonc` SHALL define provider `freetoken-local` (`@ai-sdk/openai-compatible`, `baseURL http://127.0.0.1:1919/v1`) and every local family subagent (`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`) plus the dedicated local primaries SHALL reference `freetoken-local/Qwen3.6-35B-A3B-NVFP4`. The mirror surfaces (`docs/agent-guide/registry/agents.yaml`, `AGENTS.md`) SHALL stay in sync via the roster sync gate.

#### Scenario: Local subagents resolve through the FreeToken provider

- **GIVEN** `.opencode/agent-models.jsonc` defines provider `freetoken-local`
- **WHEN** the structural suite runs
- **THEN** every `"model": "freetoken-local/Qwen3.6-35B-A3B-NVFP4"` reference resolves to that provider, its baseURL is exactly `http://127.0.0.1:1919/v1`, and no active agent entry still references `llamacpp-local/qwen38-220k`

#### Scenario: Exactly one local primary remains

- **GIVEN** the consolidation of tab-selectable primaries
- **WHEN** the suite enumerates agents whose model starts with a local provider and whose mode is `primary`
- **THEN** the result is exactly one agent named `freetoken-primary`

### Requirement: Retired llama loadouts stay documented but disabled

The llama.cpp loadouts displaced by FreeToken-native (`gemma26-throughput`, `qwen38-220k`) SHALL be marked `enabled: false` in `scripts/llm/loadouts.json` instead of deleted, keeping their measured performance notes as rationale. No agent configuration surface MAY reference a disabled slug.

#### Scenario: Disabled slugs are unreachable from both start paths

- **GIVEN** `gemma26-throughput` and `qwen38-220k` carry `enabled: false`
- **WHEN** an agent resolves a model or the proxy plans an implicit start (`planAutoStart`)
- **THEN** neither loadout is started, while an explicit admin start remains the only activation path

#### Scenario: Drift guard anchors on post-migration references

- **GIVEN** the drift guard enumerates agent-to-loadout references
- **WHEN** it extracts referenced slugs from `"model": "llamacpp-local/<slug>"` and from `"model": "freetoken-local/<model>"` entries
- **THEN** each extracted slug must exist in `loadouts.json` with `enabled != false`, so retiring another loadout without detaching agents fails the guard

### Requirement: Factory model pin points at an existing loadout slug

`factory.model` in `scripts/llm/loadouts.json` SHALL name an existing loadout slug (validator rule in `scripts/llm-proxy/loadouts.mjs`). A bare model id such as `Qwen3.6-35B-A3B-NVFP4` is invalid because no loadout of that slug exists; instead a `managed: "external"` loadout named `freetoken-local` (port 1919, no systemd unit, liveness via port probe) SHALL carry the reference.

#### Scenario: Validation rejects a factory.model without a backing loadout

- **GIVEN** the canonical validator parses `loadouts.json`
- **WHEN** `factory.model` names a string that is not any loadout slug
- **THEN** parsing fails before any consumer reads the file, naming the missing slug

#### Scenario: External managed loadout describes the FreeToken server

- **GIVEN** the `freetoken-local` loadout entry exists with `managed: "external"` and port 1919
- **WHEN** liveness is checked or a stop signal is considered
- **THEN** the decision uses the TCP port probe and never sends stop signals to the externally owned process, mirroring the `unsloth-studio` semantics

### Requirement: Factory routing falls back to FreeToken-native

`scripts/factory/route-provider.sh` SHALL emit the FreeToken endpoint (`baseUrl http://127.0.0.1:1919/v1`) for PIN and emergency fallback paths instead of the llama proxy (`127.0.0.1:18235`). The local default in `scripts/factory/provider-register-local.sh` SHALL use the same convention so the cross-script default-consistency guard stays green. The routing guard `scripts/llm/routing-check.sh` SHALL include the FreeToken backend in its reachable-backend probe so models served only on `:1919` are not reported as unrouted.

#### Scenario: Fallback emission names the FreeToken endpoint

- **GIVEN** route-provider.sh runs without a database-backed provider row
- **WHEN** it emits provider JSON for a local tier
- **THEN** the baseUrl matches `127.0.0.1:1919/v1` and no emitted fallback contains `127.0.0.1:18235`

#### Scenario: Routing guard recognizes the FreeToken backend

- **GIVEN** at least one local backend answers `/v1/models`
- **WHEN** routing-check.sh collects served model ids
- **THEN** `http://127.0.0.1:1919` is probed alongside the llama proxy and LM Studio, and a model id routed to FreeToken does not fail the check
