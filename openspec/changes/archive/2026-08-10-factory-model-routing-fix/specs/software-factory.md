## MODIFIED Requirements

### Requirement: Bonsai Provider Registration for Implement and Review

`scripts/factory/provider-register-local.sh` SHALL register the local chat model for implement and review in `tickets.provider_config` and `tickets.factory_model_slots`, using the unified gateway `http://127.0.0.1:18235/v1` as `base_url` — never a backend port directly. The model id SHALL be read from the environment variable `FACTORY_MODEL_ID`, defaulting to `gemma26-factory`; it SHALL NOT be a source-code literal.

**Renamed-to:** Local Provider Registration for Implement and Review

#### Scenario: Registration writes gateway URL and configurable model id

- **GIVEN** the registration script runs against a brand database
- **WHEN** its idempotent upserts complete
- **THEN** every row it touched has `base_url = http://127.0.0.1:18235/v1` and `model_id` equal to `FACTORY_MODEL_ID` (default `gemma26-factory`), and re-running it never reintroduces `:8093`

#### Scenario: Retired model ids never reach a routing surface

- **GIVEN** the routing surfaces `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh` and `scripts/factory/pipeline.mjs`
- **WHEN** the spec BATS suite runs in CI
- **THEN** any non-comment line naming a retired model id (`ternary-bonsai-27b`, `gemma-4-12b`) fails the test, because no backend serves those ids and the proxy would silently reroute the request instead of erroring

#### Scenario: Emergency fallback routes through the gateway

- **GIVEN** every candidate provider for a source/tier is claimed or on cooldown
- **WHEN** `route-provider.sh` emits its emergency fallback
- **THEN** the emitted `baseUrl` is the gateway `http://127.0.0.1:18235` and the `modelId` is the configured local model — not an LM Studio backend port, which since T002551 serves embedding and reranking models only and therefore hosts no chat model at all
