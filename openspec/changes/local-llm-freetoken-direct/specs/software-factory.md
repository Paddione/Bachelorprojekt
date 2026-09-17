## MODIFIED Requirements

### Requirement: Bonsai Provider Registration for Implement and Review

`scripts/factory/provider-register-local.sh` SHALL register the local chat model for implement and review in
`tickets.provider_config`, using the FreeToken-native root `http://127.0.0.1:1919` (no trailing `/v1`) as
`base_url`. It SHALL NOT write the retired llm-proxy gateway `:18235`, which was stopped on 2026-09-03 (ADR-007) and
since then answers nothing, nor any LM Studio or llama.cpp backend port. `FACTORY_LOCAL_URL` MAY override the
address; `scripts/factory/route-provider.sh` SHALL honour the same variable and the same default.

The model id SHALL NOT be a source-code literal outside the default. It SHALL be resolved in this order, first hit
wins:

1. the environment variable `FACTORY_MODEL_ID`
2. the script's built-in default `Qwen3.6-35B-A3B-NVFP4`, the only checkpoint FreeToken serves

The former first source — `factory.model` read from the llm-proxy over `GET /admin/factory` through
`factory_model_pin` — is removed together with the proxy (T900208). A pin reader against a dead port only ever
returned "no pin", so it was dead code that still looked like a routing input.

FreeToken serves one request at a time (`--max-running-requests 1`); the registered rows therefore carry
`max_concurrent = 1`.

Seit T013302 schreibt das Skript keine Phasen-Zuweisungen mehr in eine eigene Slot-Tabelle;
`tickets.provider_config` ist der einzige Speicher, den es befuellt und den Runtime-Code liest.

#### Scenario: Registration writes the FreeToken URL and configurable model id

- **GIVEN** the registration script runs against a brand database
- **WHEN** its idempotent upserts complete
- **THEN** every row it touched has `base_url = http://127.0.0.1:1919`, `max_concurrent = 1` and `model_id` equal to `FACTORY_MODEL_ID` or the built-in default, and re-running it never reintroduces `:8093` or `:18235`

#### Scenario: The environment variable overrides the default

- **GIVEN** `FACTORY_MODEL_ID` is set to `some-other-checkpoint`
- **WHEN** any routing surface resolves the model id
- **THEN** it resolves `some-other-checkpoint`, and without the variable it resolves `Qwen3.6-35B-A3B-NVFP4`

#### Scenario: No routing surface consults the retired proxy

- **GIVEN** the routing surfaces `scripts/factory/lib.sh`, `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh`, `scripts/factory/dispatcher-bridge.sh` and `scripts/factory/pipeline.mjs`
- **WHEN** the spec BATS suite runs in CI
- **THEN** no non-comment line names `:18235`, `/admin/factory` or `factory_model_pin`

#### Scenario: Retired model ids never reach a routing surface

- **GIVEN** the routing surfaces `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh` and `scripts/factory/pipeline.mjs`
- **WHEN** the spec BATS suite runs in CI
- **THEN** any non-comment line naming a retired model id (`ternary-bonsai-27b`, `gemma-4-12b`, `qwen38-220k`) fails the test, because no backend serves those ids

#### Scenario: Emergency fallback routes to FreeToken

- **GIVEN** every candidate provider for a source/tier is claimed or on cooldown
- **WHEN** `route-provider.sh` emits its emergency fallback
- **THEN** the emitted `baseUrl` is `http://127.0.0.1:1919` and the `modelId` is `FACTORY_MODEL_ID` or `Qwen3.6-35B-A3B-NVFP4` — not the retired gateway and not an LM Studio backend port, which since T002551 serves embedding and reranking models only

### Requirement: Env-driven phase model routing

`scripts/factory/pipeline.mjs` SHALL derive the model of its local `flash` tier from `FACTORY_MODEL_ID` (default
`Qwen3.6-35B-A3B-NVFP4`, provider label `llamacpp` for the OpenAI-compatible wire format) and SHALL target
FreeToken-native at `http://127.0.0.1:1919` instead of a hardcoded LM Studio constant or the retired llm-proxy
gateway `:18235` (T900208). The tier SHALL come only from `args.model_tier`, falling back to `flash`; the former
`FACTORY_MODEL_LOCKED` override is removed with the proxy that supplied it.

#### Scenario: Phases route to FreeToken

- **GIVEN** autopilot.env sets no overrides and the launch row carries no `model_tier`
- **WHEN** a pipeline phase spawns an agent
- **THEN** the agent's LLM call targets `http://127.0.0.1:1919` with model `Qwen3.6-35B-A3B-NVFP4`

## REMOVED Requirements

### Requirement: A locked factory model overrides every other model choice

The lock lived in `scripts/llm/loadouts.json` and reached the factory only through the llm-proxy's
`GET /admin/factory` endpoint. The proxy was retired on 2026-09-03 (ADR-007); the reader
`factory_model_pin`, the locked branch in `route-provider.sh` and the `FACTORY_MODEL_LOCKED`
propagation in `dispatcher-bridge.sh`/`pipeline.mjs` are removed (T900208). Model choice is
`FACTORY_MODEL_ID` plus the `provider_config` chain.
