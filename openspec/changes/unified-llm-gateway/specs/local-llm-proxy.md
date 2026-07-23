## MODIFIED Requirements

### Requirement: Proxy as sole LLM gateway

The Node proxy (`scripts/llm-proxy/server.mjs`) SHALL be the sole listener on port 18235 and the sole LLM endpoint all local harnesses (factory orchestrator, factory phase agents, opencode, other agents) use. The legacy ad-hoc proxy (`bonsai-msg-fixup-proxy.service`) SHALL be stopped and disabled by the cutover procedure; no enabled `tickets.provider_config` or `tickets.factory_model_slots` row and no tracked agent-config surface may reference a backend port (`:8093`, `:1234`) directly.

#### Scenario: Cutover replaces the legacy proxy in place

- **GIVEN** the legacy systemd user unit is active on port 18235
- **WHEN** `scripts/llm-proxy/cutover.sh` runs successfully
- **THEN** `bonsai-msg-fixup-proxy.service` is disabled and inactive, `llm-proxy.service` is enabled and active on port 18235, and `/healthz` returns HTTP 200

#### Scenario: Static config lint blocks backend-port bypasses

- **GIVEN** a tracked gateway-consumer surface (`.opencode/agent-models.jsonc`, `scripts/factory/provider-register-bonsai.sh`, `scripts/factory/route-provider.sh`, `scripts/factory/pipeline.mjs`)
- **WHEN** the spec BATS suite runs in CI
- **THEN** any direct `:8093` or `127.0.0.1:1234` literal in those surfaces fails the test (backend URLs are only allowed inside the `tickets.llm_proxy_backends` registry seeds/migrations and explicitly marked backend-internal docs)

### Requirement: Dynamic model discovery with availability fallback

Model resolution SHALL support per-backend aliases including the wildcard alias value `"*"` (resolves to the first available model of that backend). The global last-resort fallback (route any unknown model id to the first healthy backend) SHALL be disabled by default and only active when `LLM_PROXY_LOOSE_FALLBACK=1`; in strict mode an unknown model id yields HTTP 404 `unknown_model`, distinguishable from HTTP 503 `no_backend`.

#### Scenario: Wildcard alias resolves logical model id

- **GIVEN** backend `llamacpp-bonsai` is healthy and has `model_aliases = {"ternary-bonsai": "*"}`
- **WHEN** a request asks for model `ternary-bonsai`
- **THEN** the proxy routes it to the first available model of `llamacpp-bonsai` and marks the response `x-llm-proxy-served-model` accordingly

#### Scenario: Strict mode rejects unknown model ids

- **GIVEN** `LLM_PROXY_LOOSE_FALLBACK` is unset and at least one backend is healthy
- **WHEN** a request asks for a model id that matches neither a served model nor an alias
- **THEN** the proxy responds HTTP 404 `unknown_model` instead of silently serving a different model

## ADDED Requirements

### Requirement: Fixup parity with the legacy proxy

`fixups.mjs` SHALL reproduce the legacy proxy's request transformations byte-exactly: (1) `bonsai-system-role-fixup` rewrites `messages[i].role "system"→"user"` for `i>0` leaving content byte-unchanged (no `[system]` prefix); (2) `billing-header-cache-fixup` rewrites an Anthropic-shape `system[0].text` matching `^x-anthropic-billing-header:.*$` to the constant `"x-anthropic-billing-header: (normalized-for-cache);"`. Parity SHALL be proven by golden fixture tests covering both request shapes.

#### Scenario: Golden parity test for both fixups

- **GIVEN** fixture payloads with a mid-array system message (OpenAI shape) and a randomized billing-header system block (Anthropic shape)
- **WHEN** `applyFixups` processes them
- **THEN** the output equals the documented legacy-proxy transformation byte-for-byte and the test suite fails on any divergence

### Requirement: Aggregated health endpoint

The proxy SHALL expose `GET /healthz` returning HTTP 200 with `{healthy_backends, total_backends, registry_poll_age_s, degraded}` when at least one backend is healthy, and HTTP 503 otherwise. Registry-poll failures SHALL set `degraded: true` (visible staleness) while continuing to serve from the last-known-good backend cache. `GET /health` remains process liveness only.

#### Scenario: healthz reflects backend health

- **GIVEN** all backends fail their discovery probe
- **WHEN** `GET /healthz` is called
- **THEN** the response is HTTP 503, while `GET /health` still returns HTTP 200

### Requirement: Supervised service lifecycle

The proxy SHALL run under a systemd user unit `llm-proxy.service` (`Restart=on-failure`, `WantedBy=default.target`) installed via `task llm:proxy:install`. `task llm:proxy:start`/`stop` SHALL prefer the systemd unit when installed and fall back to the nohup+PID pattern otherwise. `task llm:proxy:start` SHALL refuse to start when a foreign process already listens on the proxy port.

#### Scenario: Crash recovery via systemd

- **GIVEN** `llm-proxy.service` is enabled and active
- **WHEN** the proxy process dies
- **THEN** systemd restarts it automatically and port 18235 is serving again without operator action

### Requirement: Reasoning metrics continuity

The proxy SHALL append reasoning-token records to `~/.config/factory/reasoning-metrics.jsonl` in the legacy schema (`ts, path, reasoning_tokens, estimated, budget, capped, duration_s`), extracting reasoning/thinking content from both Anthropic and OpenAI response shapes. Token counts MAY be estimated (`chars/3.5`, `estimated: true`); the budget comes from `REASONING_BUDGET` (default 8192).

#### Scenario: Metrics record on a reasoning response

- **GIVEN** a proxied completion whose response contains thinking/reasoning content
- **WHEN** the response completes
- **THEN** one JSONL record is appended with `estimated: true` and the configured budget
