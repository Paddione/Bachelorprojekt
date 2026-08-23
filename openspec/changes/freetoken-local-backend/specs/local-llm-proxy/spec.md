# Delta: local-llm-proxy

## ADDED Requirements

### Requirement: FreeToken als lokales Standard-Backend

The local LLM stack SHALL serve local agent traffic from the FreeToken engine
(`http://127.0.0.1:1919/v1`, OpenAI-compatible, model `Qwen3.6-35B-A3B-NVFP4`)
instead of llama.cpp loadouts.

#### Scenario: Familien-Subagenten nutzen FreeToken

- **GIVEN** the opencode provider `freetoken-local` is configured with baseURL `http://127.0.0.1:1919/v1`
- **WHEN** a local family subagent (`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`) is dispatched
- **THEN** its model string resolves to `freetoken-local/Qwen3.6-35B-A3B-NVFP4`

### Requirement: Stillgelegte Loadouts bleiben dokumentiert

The retired loadouts `gemma26-throughput` and `qwen38-220k` SHALL remain in
`scripts/llm/loadouts.json` with `enabled: false` and their measured values intact.

#### Scenario: Stillgelegte Loadouts werden nicht mehr vom Proxy gestartet

- **GIVEN** `loadouts.json` carries `gemma26-throughput` and `qwen38-220k` with `enabled: false`
- **WHEN** the proxy receives a request that previously routed to either loadout
- **THEN** no `[switch]` start of either loadout occurs and routing resolves to the FreeToken provider

## MODIFIED Requirements

### Requirement: Factory-Routing-Fallback

The emergency/PIN routing path in `route-provider.sh` SHALL emit the FreeToken
provider instead of llamacpp on `127.0.0.1:18235`.

#### Scenario: PIN-Lock emittiert FreeToken

- **GIVEN** `factory.model` in `loadouts.json` is set to `Qwen3.6-35B-A3B-NVFP4`
- **WHEN** `route-provider.sh` takes the PIN or emergency fallback path
- **THEN** it emits `{"provider":"freetoken","modelId":"Qwen3.6-35B-A3B-NVFP4","baseUrl":"http://127.0.0.1:1919/v1",...}`
