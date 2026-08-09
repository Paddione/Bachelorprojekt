## MODIFIED Requirements

### Requirement: Proxy as sole LLM gateway

The Node proxy (`scripts/llm-proxy/server.mjs`) SHALL be the sole listener on port 18235 and the sole LLM endpoint all local harnesses (factory orchestrator, factory phase agents, opencode, other agents) use. The legacy ad-hoc proxy (`bonsai-msg-fixup-proxy.service`) SHALL be stopped and disabled by the cutover procedure; no enabled `tickets.provider_config` or `tickets.factory_model_slots` row and no tracked agent-config surface may reference a backend port (`:8093`, `:1234`) directly.

The static lint that enforces this SHALL exist as an executable test, not as a description alone: `tests/spec/local-llm-proxy/gateway-consumer-lint.bats`. Until T002582 this scenario described a lint that was never implemented, and `provider-register-bonsai.sh` carried four `:8093` literals that nothing caught.

#### Scenario: Cutover replaces the legacy proxy in place

- **GIVEN** the legacy systemd user unit is active on port 18235
- **WHEN** `scripts/llm-proxy/cutover.sh` runs successfully
- **THEN** `bonsai-msg-fixup-proxy.service` is disabled and inactive, `llm-proxy.service` is enabled and active on port 18235, and `/healthz` returns HTTP 200

#### Scenario: Static config lint blocks backend-port bypasses

- **GIVEN** a tracked gateway-consumer surface (`.opencode/agent-models.jsonc`, `scripts/factory/provider-register-local.sh`, `scripts/factory/route-provider.sh`, `scripts/factory/pipeline.mjs`)
- **WHEN** the spec BATS suite runs in CI
- **THEN** any non-comment `:8093` or `127.0.0.1:1234` literal in those surfaces fails the test (backend URLs are only allowed inside the `tickets.llm_proxy_backends` registry seeds/migrations and explicitly marked backend-internal docs; comment lines stay exempt so retired configurations remain documentable)

#### Scenario: Lint fails when a tracked surface goes missing

- **GIVEN** a tracked surface file is renamed or deleted without updating the tracked set
- **WHEN** the lint runs
- **THEN** it fails on the missing file rather than passing vacuously over an empty candidate set

#### Scenario: Taskfile never references a missing start script

- **GIVEN** `Taskfile.llm.yml` names a PowerShell start script under `scripts/llm/`
- **WHEN** the lint runs
- **THEN** the referenced file must exist in the repository, so a task cannot advertise a start path that was never committed
