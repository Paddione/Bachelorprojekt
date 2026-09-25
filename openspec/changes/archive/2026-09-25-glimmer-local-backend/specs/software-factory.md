## MODIFIED Requirements

### Requirement: Bonsai Provider Registration for Implement and Review

`scripts/factory/provider-register-local.sh` SHALL register the local chat model for implement and review in
`tickets.provider_config`, using the local llama.cpp root `http://127.0.0.1:1919` (no trailing `/v1`) as
`base_url`. It SHALL NOT write the retired llm-proxy gateway `:18235`, which was stopped on 2026-09-03 (ADR-007) and
since then answers nothing, nor any LM Studio or llama.cpp backend port. `FACTORY_LOCAL_URL` MAY override the
address; `scripts/factory/route-provider.sh` SHALL honour the same variable and the same default.

The model id SHALL NOT be a source-code literal outside the default. It SHALL be resolved in this order, first hit
wins:

1. the environment variable `FACTORY_MODEL_ID`
2. the script's built-in default `Muse-Glimmer-30B`, the only checkpoint the local llama.cpp server on `:1919` serves (T900365; before that `Qwen3.8-27B-gsq`, T900348/T900359)

The former first source — `factory.model` read from the llm-proxy over `GET /admin/factory` through
`factory_model_pin` — is removed together with the proxy (T900208). A pin reader against a dead port only ever
returned "no pin", so it was dead code that still looked like a routing input.

The local server serves one request at a time (`-np 1`); the registered rows therefore carry
`max_concurrent = 1`.

Seit T013302 schreibt das Skript keine Phasen-Zuweisungen mehr in eine eigene Slot-Tabelle;
`tickets.provider_config` ist der einzige Speicher, den es befuellt und den Runtime-Code liest.

#### Scenario: Registration writes the local URL and configurable model id

- **GIVEN** the registration script runs against a brand database
- **WHEN** its idempotent upserts complete
- **THEN** every row it touched has `base_url = http://127.0.0.1:1919`, `max_concurrent = 1` and `model_id` equal to `FACTORY_MODEL_ID` or the built-in default, and re-running it never reintroduces `:8093` or `:18235`

#### Scenario: The environment variable overrides the default

- **GIVEN** `FACTORY_MODEL_ID` is set to `some-other-checkpoint`
- **WHEN** any routing surface resolves the model id
- **THEN** it resolves `some-other-checkpoint`, and without the variable it resolves `Muse-Glimmer-30B`

#### Scenario: No routing surface consults the retired proxy

- **GIVEN** the routing surfaces `scripts/factory/lib.sh`, `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh`, `scripts/factory/dispatcher-bridge.sh` and `scripts/factory/pipeline.mjs`
- **WHEN** the spec BATS suite runs in CI
- **THEN** no non-comment line names `:18235`, `/admin/factory` or `factory_model_pin`

#### Scenario: Retired model ids never reach a routing surface

- **GIVEN** the routing surfaces `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh` and `scripts/factory/pipeline.mjs`
- **WHEN** the spec BATS suite runs in CI
- **THEN** any non-comment line naming a retired model id (`ternary-bonsai-27b`, `gemma-4-12b`, `qwen38-220k`, `Qwen3.8-27B-gsq`) fails the test, because no backend serves those ids

#### Scenario: Emergency fallback routes to the local server

- **GIVEN** every candidate provider for a source/tier is claimed or on cooldown
- **WHEN** `route-provider.sh` emits its emergency fallback
- **THEN** the emitted `baseUrl` is `http://127.0.0.1:1919` and the `modelId` is `FACTORY_MODEL_ID` or `Muse-Glimmer-30B` — not the retired gateway and not an LM Studio backend port, which since T002551 serves embedding and reranking models only

### Requirement: Env-driven phase model routing

`scripts/factory/pipeline.mjs` SHALL derive the model of its local `flash` tier from `FACTORY_MODEL_ID` (default
`Muse-Glimmer-30B`, provider label `llamacpp` for the OpenAI-compatible wire format) and SHALL target
the local llama.cpp server at `http://127.0.0.1:1919` instead of a hardcoded LM Studio constant or the retired llm-proxy
gateway `:18235` (T900208). The tier SHALL come only from `args.model_tier`, falling back to `flash`; the former
`FACTORY_MODEL_LOCKED` override is removed with the proxy that supplied it.

#### Scenario: Phases route to the local :1919 server

- **GIVEN** autopilot.env sets no overrides and the launch row carries no `model_tier`
- **WHEN** a pipeline phase spawns an agent
- **THEN** the agent's LLM call targets `http://127.0.0.1:1919` with model `Muse-Glimmer-30B`

### Requirement: REQ-SF-EXECUTOR-004 — Muse Spark 1.3 planning with Go fallback

`.opencode/agent-models.jsonc` SHALL `muse-spark-1.3-contributor-free`
(OpenCode Zen, 1M ctx) und `muse-spark-1.3-contributor` (OpenCode Go, 1M ctx)
führen. Der `orchestrator`-Agent SHALL das Zen-Free-Modell als Primary nutzen.
Der Subagent `planner-muse` SHALL das Go-Modell nutzen und in der
Allow-Liste von `orchestrator`, `big-pickle` und `glimmer-primary` stehen
(exakte Namen, keine Wildcards). Die Eskalationskette SHALL lauten: `local`
(2 Versuche) → `planner-muse` → `deepseek-helper-go` → `deepseek-helper` →
`pro/pro-direct`. Die Empty-Return-Regel SHALL `planner-muse` als M2 nennen.

#### Scenario: Orchestrator plans on Muse Spark free tier

- **GIVEN** the factory runs with `FACTORY_EXECUTOR=opencode`
- **WHEN** the orchestrator agent resolves its model
- **THEN** `opencode-zen/muse-spark-1.3-contributor-free` is used

#### Scenario: First escalation after local goes to planner-muse

- **GIVEN** `FACTORY_MODE=mixed` and the `local` subagent failed the same partial twice
- **WHEN** the orchestrator escalates
- **THEN** the partial is dispatched to `planner-muse` with a compacted handoff
