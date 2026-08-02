# local-llm-proxy

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu local-llm-proxy ergänzen._

## Requirements

### Requirement: Proxy as sole LLM gateway

The system SHALL provide a repo-managed local LLM proxy (`scripts/llm-proxy/`, port 18235) that
is the only endpoint clients use to reach LLM backends (llama.cpp, LM Studio, DeepSeek API,
Opencode Go). Backend-specific request fixups (including the Bonsai `role:"system"` mid-array
patch) SHALL be applied inside the proxy.

#### Scenario: Client request is routed through the proxy

- **GIVEN** the proxy is running with an enabled healthy backend offering model `m1`
- **WHEN** a client sends `POST /v1/chat/completions` with `model: "m1"` to port 18235
- **THEN** the proxy forwards the request to that backend, applies its configured fixups, and
  returns the upstream response with `x-llm-proxy-backend` and `x-llm-proxy-served-model` headers

#### Scenario: Consolidated configuration points at the proxy

- **GIVEN** the migration has been applied
- **WHEN** `route-provider.sh <source> <tier>` resolves any enabled local provider row or slot
- **THEN** the returned `baseUrl` is `http://127.0.0.1:18235` and no enabled row references
  `:8093` or `:1234` directly

### Requirement: Dynamic model discovery with availability fallback

The proxy SHALL probe each enabled backend's `/v1/models` periodically and on demand, serve an
aggregated live model list, and route requests for unavailable model IDs to an available model
(exact match → alias map → first model of the highest-priority healthy backend) instead of
failing on stale model IDs. If no healthy backend exists it SHALL return a structured 503.

#### Scenario: Stale model ID falls back to an available model

- **GIVEN** the requested model ID is not offered by any healthy backend, and a healthy backend
  offers model `m2`
- **WHEN** a client sends a chat completion request with the stale model ID
- **THEN** the proxy serves the request with `m2` and exposes the substitution via
  `x-llm-proxy-served-model: m2`

#### Scenario: No backend available

- **GIVEN** no enabled backend is healthy
- **WHEN** a client sends a chat completion request
- **THEN** the proxy responds 503 with JSON error code `no_backend`

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