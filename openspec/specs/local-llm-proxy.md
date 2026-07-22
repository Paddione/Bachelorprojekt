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