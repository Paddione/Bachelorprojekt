## ADDED Requirements

### Requirement: Das Session-Modell folgt dem Factory-Default

Eine Session lief bisher potenziell auf einem anderen Modell als alles andere im System, ohne dass
das irgendwo sichtbar wurde: `DEFAULT_CLAUDE_SESSION_MODEL` ist ein fest notiertes Modell, und die
Auflösungskette fiel über eine Umgebungsvariable darauf zurück.

Session model resolution SHALL derive its model from the factory default (`factory.model` in
`scripts/llm/loadouts.json`, read through the proxy) instead of carrying an independent default.
`DEFAULT_CLAUDE_SESSION_MODEL` SHALL remain only as the last fallback for the case where the proxy
yields no value, and SHALL NOT be reached while the proxy answers.

#### Scenario: A session uses the model everything else uses

- **GIVEN** the factory default names a model
- **WHEN** a session resolves its model
- **THEN** it resolves to that same model

#### Scenario: Changing the default moves the sessions with it

- **GIVEN** the factory default is changed
- **WHEN** a new session resolves its model
- **THEN** it resolves to the new value without any separate session-side change

#### Scenario: The hard-coded fallback stays reachable only when nothing else answers

- **GIVEN** the proxy does not answer and no factory default can be read
- **WHEN** a session resolves its model
- **THEN** it falls back to `DEFAULT_CLAUDE_SESSION_MODEL`, and the fallback is logged as such

## MODIFIED Requirements

### Requirement: Proxy as sole LLM gateway

The Node proxy (`scripts/llm-proxy/server.mjs`) SHALL be the sole listener on port 18235 and the sole LLM endpoint all local harnesses (factory orchestrator, factory phase agents, opencode, other agents) use. The legacy ad-hoc proxy (`bonsai-msg-fixup-proxy.service`) SHALL be stopped and disabled by the cutover procedure; no enabled `tickets.provider_config` row and no tracked agent-config surface may reference a backend port (`:8093`, `:1234`) directly.

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

### Requirement: Qwen3-Coder is available as an additive chat loadout

`scripts/llm/loadouts.json` SHALL declare a loadout `qwen3-coder` serving
Qwen3-Coder-30B-A3B-Instruct (UD-Q4_K_XL) on port 8097 within `exclusiveGroup: "chat-gpu"`, and
`tickets.llm_proxy_backends` SHALL carry a matching enabled entry for that port on both brands.

Adding this loadout SHALL NOT change model routing: no row in `tickets.provider_config` may be
modified by this change. The loadout is started on
demand; the default path remains whichever backend the routing tables already name.

The loadout SHALL rely on `--fit` for layer placement and MUST NOT pin `ctx` or `ngl`, because the
model (17 GB) exceeds available VRAM (16 GB) and depends on automatic MoE offload. Its `notes`
SHALL record that `fit.targetMarginMib` is carried over from the reference run and is **not** a
measured value, so a later reader does not mistake it for one.

#### Scenario: Loadout is declared in canonical form

- **GIVEN** the repository checkout with the `qwen3-coder` loadout present
- **WHEN** `task llm:loadouts:check` runs in CI
- **THEN** the command exits 0, confirming the entry matches the canonical `writeLoadouts()` form

#### Scenario: Port does not collide with an existing loadout

- **GIVEN** `scripts/llm/loadouts.json` containing all declared loadouts
- **WHEN** the ports of every entry are collected
- **THEN** port 8097 belongs to `qwen3-coder` alone, and the ports already taken by other
  loadouts (8091, 8092, 8095, 8096, 8098, 8099) are not reassigned to it

#### Scenario: Backend registration leaves routing untouched

- **GIVEN** the migration registering `llamacpp-qwen3coder` has been applied to a brand database
- **WHEN** `tickets.provider_config` is read back
- **THEN** no row references `qwen3-coder`, and the previously configured model ids for every
  tier are unchanged

#### Scenario: Loadout declares no pinned context or layer count

- **GIVEN** the `qwen3-coder` entry with `fit.enabled` set to true
- **WHEN** its `args.ctx` and `args.ngl` are read
- **THEN** both are null, satisfying the existing guard that no loadout using `--fit` pins either
  value

