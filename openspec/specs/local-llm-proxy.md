# local-llm-proxy

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu local-llm-proxy ergänzen._

## Requirements

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

### Requirement: Backend registry and admin API

Backends SHALL be stored in `tickets.llm_proxy_backends` (name, kind, base_url, api_key_env,
enabled, priority, fixups, model_aliases); API keys SHALL be resolved from environment variables
only. The website SHALL expose admin CRUD endpoints under `/api/admin/llm-proxy/*` following the
`/api/admin/ki/providers` guard/validation pattern, and a status endpoint that degrades to
`proxy: "offline"` with the DB state when the proxy is unreachable.

#### Scenario: Status endpoint tolerates offline proxy

- **GIVEN** the proxy process is not running
- **WHEN** an admin requests `GET /api/admin/llm-proxy/status`
- **THEN** the endpoint responds 200 with `proxy: "offline"` and the backend list from the DB

### Requirement: Steuerung-Tab and Sidekick GUI

The Steuerung tab (`/admin/pipeline?tab=control`) SHALL render an LLM proxy panel (backend table
with live health, discovered models, enable/priority editing, probe-now action, effective
phase→model resolution), and the Sidekick submenu SHALL contain an admin-only `llm-proxy` entry
opening a drawer view with compact status, backend toggles, reload, and a link to the Steuerung
tab.

#### Scenario: Admin inspects and edits backends in the Steuerung tab

- **GIVEN** an admin opens `/admin/pipeline?tab=control` while the proxy is running
- **WHEN** the LLM proxy panel loads
- **THEN** it shows each backend with health state and discovered models, and toggling
  `enabled` persists via the admin API and triggers a proxy reload

#### Scenario: Sidekick submenu entry opens the proxy view

- **GIVEN** an admin opens the Sidekick
- **WHEN** they select the `LLM-Proxy` submenu entry
- **THEN** the drawer shows proxy status and backend health without leaving the current page

<!-- merged from change delta local-llm-proxy.md (045b40bf74b3) -->

### Requirement: Service installation verifies port ownership and the resulting unit state

`task llm:proxy:install-service` SHALL determine whether the proxy port is still served before
enabling the systemd unit, and SHALL NOT rely on the PID file alone — the PID file only knows the
`nohup` instance and stays silent when the port is held by anything else. After
`systemctl enable --now`, the task SHALL confirm the unit actually reaches `active (running)`
rather than printing a success message: `enable --now` returns successfully while a unit is stuck
in `auto-restart`, and `is-active` reports `activating` during that state, which is
indistinguishable from a slow start.

#### Scenario: A manually started instance still holding the port is stopped

- **GIVEN** a proxy instance answers on the port but is not described by the PID file
- **WHEN** the install task runs
- **THEN** the task identifies the owning process via the port and stops it before enabling the unit

#### Scenario: A unit stuck in a restart loop fails the install

- **GIVEN** the unit cannot bind its port and systemd keeps restarting it
- **WHEN** the install task waits for the unit state
- **THEN** the task exits non-zero and prints the journal tail instead of reporting success

<!-- merged from change delta local-llm-proxy.md (d3faf724f6c2) -->

### Requirement: Loadout-scoped Web UI config file

A loadout MAY declare an optional `uiConfigFile` path. When present, the runner SHALL pass it to
`llama-server` as `--ui-config-file`. When absent, no such argument SHALL be emitted, so loadouts
without the field keep their current argv byte-for-byte.

#### Scenario: Loadout declares uiConfigFile

- **GIVEN** a loadout whose `uiConfigFile` is `/run/user/1000/llama-ui-config.json`
- **WHEN** the runner builds the server argv for that loadout
- **THEN** the argv contains `--ui-config-file` immediately followed by that exact path

#### Scenario: Loadout omits uiConfigFile

- **GIVEN** a loadout with no `uiConfigFile` key, or with the value `null`
- **WHEN** the runner builds the server argv for that loadout
- **THEN** the argv contains no `--ui-config-file` token

#### Scenario: Only the 26B chat loadout is seeded

- **GIVEN** the shipped `scripts/llm/loadouts.json`
- **WHEN** the loadouts are inspected for a non-null `uiConfigFile`
- **THEN** exactly one loadout carries it, and its slug is `gemma26-factory`

### Requirement: MCP server seed is generated from the registry

The seed SHALL be generated from `docs/agent-guide/registry/mcp.yaml`. Every registry entry that is
reachable over HTTP SHALL appear in the seed, addressed by its `browser_endpoint` when the registry
declares one and by its `endpoint` otherwise. Entries the bridge does not serve SHALL NOT appear.

The generator SHALL emit the `mcpServers` value as a **JSON string containing an array**, matching
what the Web UI parses. Emitting a bare array SHALL be treated as a defect, because the Web UI
discards an unparseable value silently.

#### Scenario: Registry entry with a browser endpoint

- **GIVEN** a registry entry declaring `endpoint: http://localhost:18080/mcp` and
  `browser_endpoint: http://localhost:18082/mcp`
- **WHEN** the seed is generated
- **THEN** the entry's `url` in the seed is the browser endpoint, not the plain endpoint

#### Scenario: Seed value is a string, not an array

- **GIVEN** a generated seed file
- **WHEN** its `mcpServers` value is read
- **THEN** the value's JSON type is string, and parsing that string yields an array of objects each
  carrying `id`, `enabled`, `url` and `name`

#### Scenario: Every seeded server answers an MCP handshake

- **GIVEN** a generated seed file and the running MCP fleet
- **WHEN** an `initialize` request is sent to each seeded `url`
- **THEN** each responds with HTTP 200 and a JSON-RPC result carrying `serverInfo`

### Requirement: Bearer tokens never enter tracked files

The tracked seed template SHALL carry the bearer token only as an unexpanded `${BGE_MCP_TOKEN}`
reference. The expanded file SHALL be written outside the repository working tree at start time.

#### Scenario: Template holds no expanded secret

- **GIVEN** the tracked seed template
- **WHEN** its contents are scanned
- **THEN** the literal `${BGE_MCP_TOKEN}` is present and no expanded token value is

#### Scenario: Rendered runtime file carries the header

- **GIVEN** `BGE_MCP_TOKEN` is exported in the environment
- **WHEN** the seed is rendered to its runtime path
- **THEN** the rendered `bge-mcp` entry carries an `Authorization` header with the expanded value,
  and the runtime path lies outside the repository working tree

### Requirement: Seeded servers reach the Web UI as defaults

A `llama-server` started with a generated seed SHALL expose that seed under `/props` in
`ui_settings.mcpServers`, so the Web UI adopts the servers as defaults without any browser-side
configuration.

#### Scenario: Seed is observable through /props

- **GIVEN** a `llama-server` started with `--ui-config-file` pointing at a generated seed
- **WHEN** `GET /props` is requested
- **THEN** `ui_settings.mcpServers` equals the seed's `mcpServers` value verbatim

#### Scenario: The llama-server CORS proxy stays disabled

- **GIVEN** a `llama-server` started with a generated seed
- **WHEN** `GET /props` is requested
- **THEN** `cors_proxy_enabled` is `false`

<!-- merged from change delta local-llm-proxy.md (5a32f588a2f9) -->

### Requirement: REQ-LLMPROXY-INFLIGHT-001 — Konfigurierbare per-Backend-Parallelität

Der llm-proxy (`scripts/llm-proxy/server.mjs`) SHALL die strikte
1-Request-FIFO-Serialisierung pro Backend durch ein Semaphor ersetzen, dessen Limit aus
der neuen Spalte `tickets.llm_proxy_backends.max_inflight` (integer NOT NULL DEFAULT 1)
stammt. Mit `max_inflight=1` SHALL das Verhalten identisch zu heute sein.
`/admin/state` SHALL pro Backend `inflight` und `max_inflight` ausweisen. `/health`
bleibt unverändert; Gang-Gating-Clients SHALL `/admin/state` verwenden.

#### Scenario: Default keeps today's serialization

- **GIVEN** a backend row with `max_inflight=1`
- **WHEN** two requests for that backend arrive concurrently
- **THEN** the second request waits until the first completes (FIFO order preserved)

#### Scenario: Raising max_inflight enables real concurrency without code changes

- **GIVEN** `max_inflight=4` for backend `llamacpp-bonsai` and a restarted/refreshed proxy
- **WHEN** four bonsai subagent requests arrive concurrently
- **THEN** all four are in flight simultaneously and `/admin/state` reports `inflight=4, max_inflight=4`

<!-- merged from change delta local-llm-proxy.md (ed4e423648d3) -->

### Requirement: Loadout autorestart on failure

The system SHALL restart a loadout-managed llama.cpp unit automatically after it exits
unexpectedly, without requiring a separate polling watchdog process. The `systemd-run` command
used to start a loadout SHALL set `Restart=on-failure` and a bounded `RestartSec`.

#### Scenario: Killed loadout process restarts without operator action

- **GIVEN** a loadout (e.g. `gptoss-context`) is running and healthy
- **WHEN** its underlying `llama-server` process is killed (crash, OOM)
- **THEN** systemd restarts the unit automatically within `RestartSec`, and `/admin/loadouts/status`
  reports it as running and healthy again without any `/admin/loadouts/<slug>/start` call

### Requirement: Auto-start and queue for conflict-free loadouts

The system SHALL, when a chat completion request targets a model that has no healthy backend but
matches a stopped loadout, automatically start that loadout and hold the request in the existing
per-backend queue until the loadout becomes healthy — provided the loadout does not belong to the
same `exclusiveGroup` as any currently running loadout. The system SHALL NOT stop a running
loadout to satisfy a conflicting request.

#### Scenario: Request auto-starts a conflict-free stopped loadout

- **GIVEN** loadout `bge-rerank-batch` is configured and currently stopped, and no loadout with
  the same `exclusiveGroup` is running
- **WHEN** a client sends a request whose `model` resolves to `bge-rerank-batch`
- **THEN** the proxy starts the loadout, waits for it to become healthy, and forwards the queued
  request without returning an error to the client

#### Scenario: Conflicting request is rejected, not auto-preempted

- **GIVEN** loadout `gemma-factory` is running and belongs to `exclusiveGroup: "chat-gpu"`
- **WHEN** a client sends a request whose `model` resolves to `gptoss-context`, which also
  belongs to `exclusiveGroup: "chat-gpu"`
- **THEN** the proxy responds with HTTP 409 naming the conflicting loadout and does not stop
  `gemma-factory`

### Requirement: Gemma single-agent and shared multi-agent loadout profiles

The system SHALL provide two mutually exclusive Gemma loadout profiles sharing one port: a
single-agent full-context profile (`-np 1`, fixed context) and a shared full-context multi-agent
profile (`-np 5`, `-kvu`, larger context pool). Both SHALL use `-fit on` with configured
`minCtx`/`targetMarginMib` instead of a hard-failing fixed context.

#### Scenario: Starting one Gemma profile blocks the other

- **GIVEN** `gemma-factory` is running on its configured port
- **WHEN** an operator calls `POST /admin/loadouts/gemma-multiagent/start`
- **THEN** the request fails with HTTP 409 `port_busy` and `gemma-factory` keeps running
  unaffected

#### Scenario: Reduced context from -fit is visible, not silent

- **GIVEN** a Gemma loadout starts with `-fit on` and available VRAM forces a smaller context
  than configured
- **WHEN** an operator queries `/admin/loadouts/status`
- **THEN** the response's `chosen.ctx` for that loadout reflects the actually granted context,
  not the configured target

<!-- merged from change delta local-llm-proxy.md (8bcab41279fc) -->

### Requirement: Health endpoint reports readiness, not liveness

The proxy SHALL answer `GET /health` with the question "can I serve requests",
not "is my process alive". Readiness is determined by the **enabled backends
with `priority = 1`** — the local primary path. A lower-priority backend
(cloud fallback) is reported but SHALL NOT make the proxy ready on its own,
because it is slower, costs money and sends data off-premises, which the
platform's GDPR-by-design stance treats as a fallback rather than a substitute.

The response body SHALL name the degraded backends in both the ready and the
not-ready case, so a caller sees *which* backend is missing rather than only
*that* something is missing.

If no `priority = 1` backend is present at all, the proxy SHALL be considered
not ready.

#### Scenario: Local primary backend is down while a cloud fallback is healthy

- **GIVEN** an enabled backend with `priority = 1` that is not healthy
- **AND** an enabled backend with `priority = 2` that is healthy
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `503` with `ready: false` and lists the
  unhealthy priority-1 backend in `degraded`

#### Scenario: Only a lower-priority fallback is down

- **GIVEN** all enabled `priority = 1` backends are healthy
- **AND** an enabled backend with `priority = 2` is not healthy
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `200` with `ready: true` and still lists the
  unhealthy fallback in `degraded`

#### Scenario: No priority-1 backend is registered

- **GIVEN** no enabled backend has `priority = 1`
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `503` with `ready: false`

### Requirement: Liveness has its own endpoint

The proxy SHALL expose `GET /livez` answering `200` unconditionally while the
process is running, so callers that genuinely only need liveness are not
affected by backend state.

The systemd unit SHALL NOT gate restarts on readiness: restarting the proxy
cannot recover a backend that runs as a separate process on the Windows host.

#### Scenario: Liveness during a backend outage

- **GIVEN** an enabled `priority = 1` backend is not healthy
- **WHEN** a caller requests `GET /livez`
- **THEN** the proxy responds `200`, while `GET /health` responds `503`

<!-- merged from change delta local-llm-proxy.md (4f82bd58f549) -->

### Requirement: Stdio to HTTP/SSE bridging

The llm-proxy SHALL bridge stdio-based MCP servers to HTTP/SSE endpoints. It SHALL load configuration from a JSON file, spawn child processes for enabled servers, establish SSE sessions, and route JSON-RPC messages between clients and child processes.

#### Scenario: Clients establish SSE session to a bridged server

- **GIVEN** the server `ticket-mcp` is enabled in `mcp-bridge.json`
- **WHEN** a client sends a `GET /mcp/ticket-mcp` request to the proxy
- **THEN** the proxy starts the `ticket-mcp` process, establishes an SSE stream, generates a session ID, and sends it to the client

#### Scenario: Client sends JSON-RPC message to a bridged server

- **GIVEN** an active SSE session with ID `s1` for `ticket-mcp` exists
- **WHEN** the client sends `POST /mcp/ticket-mcp?sessionId=s1` with a JSON-RPC payload
- **THEN** the proxy forwards the payload to the stdin of the `ticket-mcp` process and responds with HTTP status 202

#### Scenario: Client sends request without authorization token when configured

- **GIVEN** `ticket-mcp` requires a bearer token from `TICKET_MCP_BRIDGE_TOKEN` and the client request has an invalid or missing Authorization header
- **WHEN** the client sends a request to `/mcp/ticket-mcp`
- **THEN** the proxy responds with HTTP status 401

<!-- merged from change delta local-llm-proxy.md (a3b9ee35fff7) -->

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

<!-- merged from change delta local-llm-proxy.md (a65880a2a8a1) -->