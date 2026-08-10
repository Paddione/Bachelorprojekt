# local-llm-proxy

## Purpose

Der lokale LLM-Proxy (`scripts/llm-proxy/`) ist das alleinige Gateway, über das jeder lokale
Harness — Factory-Orchestrator, Factory-Phasenagenten, opencode und weitere Agenten — mit den
llama.cpp-Backends spricht. Er hört auf Port 18235, löst Modellnamen auf Backends auf und
verwaltet die Loadouts als transiente systemd-User-Units: er startet ein Loadout bei Bedarf
selbst und setzt dabei durch, dass sich Loadouts derselben `exclusiveGroup` nicht gegenseitig
von der GPU verdrängen.

Der Zweck dieser Bündelung ist, dass Routing, Kontextbudget, Tool-Schema-Sanitizing und
GPU-Belegung an genau einer Stelle entschieden werden statt in jedem Konsumenten einzeln.

## Requirements

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

### Requirement: Endpoint availability is decided by HTTP status

The system SHALL determine LLM endpoint availability from the HTTP status code, not from the
exit code of the request tool alone. An endpoint answering with a 5xx status SHALL be treated
as unavailable.

#### Scenario: A server answering 500 is not treated as available

- **GIVEN** an HTTP server that responds to every request with status 500
- **WHEN** the endpoint availability check is executed against it
- **THEN** the check reports the endpoint as unavailable
- **AND** a server responding with status 200 is reported as available

### Requirement: The long-context probe proves its own context size

The system SHALL reject a long-context probe result whose prompt did not reach the intended
size. The probe SHALL read the prompt size reported by the server rather than assuming it from
the constructed input.

#### Scenario: A probe whose filler did not take effect fails instead of passing

- **GIVEN** a probe request whose filler text produced fewer tokens than the configured minimum
- **WHEN** the probe evaluates the server response
- **THEN** the probe fails with an explicit message about the missing context size
- **AND** it does not report the string-recall result as valid

### Requirement: The long-context probe targets the configured loadout port

The system SHALL address the probe at the port declared for the loadout under test in the
loadout registry, so that a port change in the registry cannot silently disable the probe.

#### Scenario: Probe endpoint and loadout registry agree

- **GIVEN** the loadout registry declares a port for the chat loadout under test
- **WHEN** the probe endpoint is resolved
- **THEN** the resolved port equals the declared port
- **AND** no decommissioned port is referenced

### Requirement: Loadout sampling and chat template arguments reach the server

The system SHALL pass sampling parameters and chat template arguments declared in a loadout to
the model server process. Loadouts that declare none of these fields SHALL produce an unchanged
argument vector.

#### Scenario: Declared parameters appear in the server arguments

- **GIVEN** a loadout declaring sampling parameters and chat template arguments
- **WHEN** the server argument vector is built
- **THEN** the vector contains the corresponding server flags with the declared values

#### Scenario: A loadout without these fields is unaffected

- **GIVEN** a loadout that declares neither sampling parameters nor chat template arguments
- **WHEN** the server argument vector is built
- **THEN** the vector contains none of these flags

<!-- merged from change delta local-llm-proxy.md (f1c6036c6a3e) -->

### Requirement: KV Cache Budget Calculator
The platform SHALL include a parameterizable KV cache RAM/VRAM budget calculation utility (`scripts/llm/kv-budget.sh`).

#### Scenario: Running KV budget calculator
- GIVEN the `scripts/llm/kv-budget.sh` script is executed
- WHEN passed model context and slot flags
- THEN it outputs expected memory footprints for `-kvu` and `-no-kvu` configurations.

<!-- merged from change delta local-llm-proxy.md (53200db2856c) -->

### Requirement: Embed-Skript bietet einen zählenden Skip-Modus ohne Index-Änderung

The system SHALL provide a `--count-skipped` mode in `scripts/openspec-embed.mjs` that counts
skipped embeddings without modifying the index, reports the count and the reason separately
(at minimum distinguishing context-overflow from everything else), and names
`task openspec:embed:backfill` as the way to reduce the number.

#### Scenario: --count-skipped zählt ohne den Index zu verändern

- **GIVEN** der Embed-Index enthält übersprungene Dokumente
- **WHEN** `scripts/openspec-embed.mjs --count-skipped` ausgeführt wird
- **THEN** wird die Anzahl der übersprungenen Dokumente ausgegeben
- **AND** der Index wird dabei nicht verändert

#### Scenario: Zahl und Grund werden getrennt ausgewiesen

- **GIVEN** Dokumente wurden aus unterschiedlichen Gründen übersprungen
- **WHEN** `--count-skipped` läuft
- **THEN** nennt die Ausgabe die Zahl je Grund getrennt (z. B. Kontextüberschreitung
  gegenüber Parse-Fehler)
- **AND** die Ausgabe nennt `task openspec:embed:backfill` als Weg, die Zahl abzubauen

### Requirement: Embed-Wrapper meldet die Gesamtlage non-fatal

The system SHALL have `scripts/openspec-embed-local.sh` report the overall skip situation
after indexing, without blocking the commit when only the count is reported. The existing hard
error path for a failed embedding SHALL remain unchanged.

#### Scenario: Wrapper meldet die Gesamtlage nach dem Indizieren

- **GIVEN** ein Commit löst den Embed-Wrapper aus
- **WHEN** das Indizieren abgeschlossen ist
- **THEN** gibt der Wrapper die Gesamtzahl der übersprungenen Dokumente aus
- **AND** der Commit wird dadurch nicht blockiert

#### Scenario: Fehlgeschlagenes Embedding bleibt ein harter Fehler

- **GIVEN** ein Embedding schlägt tatsächlich fehl
- **WHEN** der Wrapper läuft
- **THEN** wird der bestehende harte Fehlerpfad ausgelöst
- **AND** die Meldung unterscheidet diesen Fall von einer reinen Zählung

<!-- merged from change delta local-llm-proxy.md (2b68aa820ab5) -->

### Requirement: Agent-Modell- und Kontextangaben entsprechen dem geladenen Loadout

The system SHALL configure the opencode subagents to match the actually loaded model and
context size, so that the agent definitions do not name a model that is not loaded and do not
promise a context size larger than what is available.

#### Scenario: Agent-Definition nennt das geladene Modell

- **GIVEN** `.opencode/agent-models.jsonc` verdrahtet die Subagenten
- **WHEN** die Modell-Referenz gegen das geladene Loadout geprüft wird
- **THEN** nennt die Definition das tatsächlich geladene Modell
  (`gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf`)
- **AND** keine Referenz auf das nicht geladene 12B-Modell ist enthalten

#### Scenario: Kontextangabe entspricht dem gemessenen n_ctx

- **GIVEN** die Agent-Beschreibung nennt eine Kontextgröße
- **WHEN** sie gegen den gemessenen Wert geprüft wird
- **THEN** entspricht sie `n_ctx=99840`
- **AND** die falsche Angabe von 262144 ist entfernt

### Requirement: Gemma26-Loadout fährt drei Slots mit unified context

The system SHALL configure the `gemma26-factory` loadout with three slots and the `-kvu`
flag for a unified KV buffer shared across sequences, while keeping `max_inflight` at 1, so
that each factory slot sees the full context without increasing KV memory fourfold.

#### Scenario: Loadout hat drei Slots und -kvu

- **GIVEN** `scripts/llm/loadouts.json` definiert `gemma26-factory`
- **WHEN** die Loadout-Konfiguration geprüft wird
- **THEN** ist `args.parallel` auf 3 gesetzt
- **AND** `-kvu` ist in `extraArgs` enthalten
- **AND** `max_inflight` bleibt bei 1

#### Scenario: fit.minCtx bleibt unverändert

- **GIVEN** das Loadout nutzt einen unified KV-Puffer
- **WHEN** `fit.minCtx` geprüft wird
- **THEN** bleibt es unverändert (32768)
- **AND** die KV-Quantisierung bleibt `q4_0`

<!-- merged from change delta local-llm-proxy.md (795a840968e8) -->

### Requirement: Explicit loadout start honours exclusiveGroup

The explicit start endpoint (`POST /admin/loadouts/<slug>/start`) SHALL refuse to start a loadout
while another loadout sharing its `exclusiveGroup` is active, and SHALL do so with the same error
code (`exclusive_conflict`), the same HTTP status (409) and the same wording as the auto-start
path already uses. The proxy SHALL NOT stop the conflicting loadout by itself; the message SHALL
name the blocking slug, the shared group and the stop command.

The conflict predicate SHALL be defined exactly once and be shared by both start paths, so the
two cannot drift apart. A loadout that is itself already active SHALL NOT count as its own
conflict — that case remains `already_running`.

Loadouts without an `exclusiveGroup`, and loadouts in a different group, SHALL NOT block a start.

#### Scenario: Explicit start is refused across port boundaries

- **GIVEN** `gemma9-factory` (group `chat-gpu`, port 8092) is active
- **WHEN** `POST /admin/loadouts/gemma26-factory/start` is requested (group `chat-gpu`, port 8091)
- **THEN** the response is `409` with code `exclusive_conflict`, the message names
  `gemma9-factory` and its stop command, and no unit is started or stopped

#### Scenario: A loadout without an exclusiveGroup does not block

- **GIVEN** only `bge-embed-cpu` is active (no `exclusiveGroup` since T002729)
- **WHEN** `POST /admin/loadouts/gemma26-factory/start` is requested
- **THEN** the start proceeds

#### Scenario: Both start paths share one conflict definition

- **GIVEN** the same set of active loadouts
- **WHEN** the conflict is evaluated for the auto-start path and for the explicit start path
- **THEN** both report the same blocking slug and group

### Requirement: Turn markers are stripped from non-streaming content

The proxy SHALL remove known chat-template turn markers (`<|message_sep|>`, `<|role_sep|>`)
from the `content` field of non-streaming chat completions before delivering them, and SHALL
adjust `content-length` accordingly. Streaming responses SHALL pass through unchanged.

Stripping SHALL apply only to the `content` field. `tool_calls` and every other field SHALL be
delivered unchanged, because the tool-call path already consumes the marker and yields an empty
`content`.

An answer that contains no marker SHALL be delivered byte-identical to the upstream body.

#### Scenario: Marker is removed from a plain-text answer

- **GIVEN** the backend answers a non-streaming request with `content` `"Paris<|message_sep|>"`
- **WHEN** the proxy delivers the response
- **THEN** the client receives `content` `"Paris"` and an unchanged `finish_reason`

#### Scenario: Tool-call responses are untouched

- **GIVEN** the backend answers with `content` `""`, populated `tool_calls` and
  `finish_reason` `tool_calls`
- **WHEN** the proxy delivers the response
- **THEN** `tool_calls` is delivered unchanged and `content` stays `""`

#### Scenario: Streaming responses pass through

- **GIVEN** the request carries `stream: true`
- **WHEN** the proxy delivers the response
- **THEN** the body is piped through unchanged, markers included

<!-- merged from change delta local-llm-proxy.md (998e14031314) -->

### Requirement: Training lock signals GPU occupancy

The repository SHALL provide `scripts/gpu-lock.sh` with the verbs `acquire`, `release`
and `status`. `acquire` SHALL write a lock file containing at least the acquiring process
id, an acquisition timestamp and a human-readable reason. `release` SHALL remove it.
`status` SHALL report whether a lock is held and, if so, by which process.

The lock file path SHALL be overridable by environment variable so the behaviour can be
exercised against fixtures without touching the real lock.

#### Scenario: acquire writes a lock carrying the process id

- **GIVEN** no lock file exists
- **WHEN** `scripts/gpu-lock.sh acquire` runs successfully
- **THEN** the lock file exists and contains the acquiring process id and a timestamp

#### Scenario: release removes the lock

- **GIVEN** a lock file written by `acquire`
- **WHEN** `scripts/gpu-lock.sh release` runs
- **THEN** the lock file no longer exists and `status` reports no lock held

#### Scenario: status distinguishes held from free

- **GIVEN** no lock file exists
- **WHEN** `scripts/gpu-lock.sh status` runs
- **THEN** it exits zero and reports that no lock is held

### Requirement: Acquisition drains before it stops, and proves free VRAM

`acquire` SHALL, in order: write the lock, wait until no request is in flight on the
local GPU backends, stop the loadouts of the `chat-gpu` exclusive group, and only then
verify that sufficient GPU memory is actually free.

Waiting SHALL NOT cancel in-flight requests; a request that is already running is allowed
to finish. A bounded overall wait SHALL apply so that `acquire` cannot hang indefinitely;
on expiry `acquire` SHALL fail and release its lock rather than cancel anything.

The success condition SHALL be measured free GPU memory, NOT the number of units stopped.
Because every loadout runs with `--fit on`, which silently offloads layers to host RAM
instead of failing, a stop-count would report success while the training run degrades
invisibly.

If insufficient memory is free after stopping the managed loadouts, `acquire` SHALL fail
and name the remaining holder with its process id, port and model, then release its lock.

#### Scenario: acquisition fails when memory stays occupied

- **GIVEN** a holder that keeps GPU memory allocated and is not a managed loadout
- **WHEN** `acquire` runs and the measured free memory stays below the required amount
- **THEN** it exits non-zero, its output names the remaining holder, and no lock file is
  left behind

#### Scenario: an in-flight request is awaited, not cancelled

- **GIVEN** a request in flight on a local backend
- **WHEN** `acquire` runs
- **THEN** the request completes normally and the stop step begins only afterwards

#### Scenario: the bounded wait fails instead of cancelling

- **GIVEN** a backend that never reports its in-flight count returning to zero
- **WHEN** `acquire` runs and the bounded wait expires
- **THEN** it exits non-zero, no request was cancelled, and no lock file is left behind

### Requirement: The proxy treats a held lock as draining, not as unhealthy

While the lock is held, the proxy SHALL treat backends of kind `llamacpp` and `lmstudio`
as `draining` — a state distinct from both `healthy` and `unhealthy`. Draining backends
SHALL NOT be selected for new requests, SHALL NOT enter the unhealthy backoff, and SHALL
NOT emit the unhealthy log line. The transition into and out of draining SHALL be logged
once each, naming the backend and the lock as the cause.

Which backends drain SHALL be decided by their `kind`, never by a hard-coded list of
backend names, so a newly added local backend is covered without a code change.

`/admin/state` SHALL expose the draining state and the lock information.

`/health` SHALL remain green while any backend can still serve. `/health` answers
readiness — during draining the proxy can be served, via the remote backend on the next
priority — so reporting unready would be the very deception the endpoint is meant to
prevent.

#### Scenario: a held lock removes local backends from selection

- **GIVEN** a held training lock whose process is alive
- **WHEN** the proxy selects a backend for a chat completion
- **THEN** it selects the remote backend and no `llamacpp` backend

#### Scenario: draining does not look like a failure

- **GIVEN** a held training lock
- **WHEN** the proxy evaluates backend health
- **THEN** the drained backends are reported as draining, not unhealthy, and no unhealthy
  log line is emitted for them

#### Scenario: health stays green while a remote backend can serve

- **GIVEN** a held training lock and a reachable remote backend
- **WHEN** `/health` is requested
- **THEN** it reports ready

#### Scenario: draining is decided by kind

- **GIVEN** a backend of kind `llamacpp` whose name appears in no list in the source
- **WHEN** a lock is held
- **THEN** that backend drains as well

### Requirement: An orphaned lock does not hold the GPU hostage

The proxy SHALL verify on each registry poll that the process named in the lock file is
still alive. A lock whose process has died SHALL be treated as absent and the lock file
removed, so a crashed training run cannot keep the local backends drained indefinitely.

A lock file that cannot be read or parsed SHALL be treated as held, and the condition
SHALL be logged prominently. This direction is deliberate: treating a damaged lock as
absent risks destroying a running multi-hour training run, whereas treating it as held
costs only remote inference, because the fallback works.

#### Scenario: a lock from a dead process is discarded

- **GIVEN** a lock file naming a process id that is no longer alive
- **WHEN** the proxy evaluates the lock
- **THEN** it treats no lock as held and removes the stale lock file

#### Scenario: an unreadable lock file counts as held

- **GIVEN** a lock file whose contents cannot be parsed
- **WHEN** the proxy evaluates the lock
- **THEN** it treats the lock as held and logs the unreadable lock file

### Requirement: The externally managed GPU holder is part of the exclusive group

`scripts/llm/loadouts.json` SHALL carry an entry for the Unsloth Studio inference server
with `exclusiveGroup: chat-gpu` and a marker identifying it as externally managed. Unlike
every other loadout it has no systemd unit: it is started as a child of the Unsloth
Studio process, so its liveness SHALL be determined from its port and process rather than
from unit state.

`findExclusiveConflict` SHALL report a conflict against this entry exactly as it does for
unit-backed loadouts, so that the single shared definition of conflict keeps covering
every GPU holder.

An externally managed loadout SHALL NOT be terminated by signal from the lock path. It is
stopped through its owner's interface if that is available; otherwise `acquire` fails and
names it. A holder that the tooling does not own is reported, not killed.

#### Scenario: the external holder participates in conflict detection

- **GIVEN** the externally managed entry is active
- **WHEN** `findExclusiveConflict` is called for another loadout of group `chat-gpu`
- **THEN** it reports a conflict naming the external entry

#### Scenario: liveness of the external holder comes from its port

- **GIVEN** an externally managed loadout entry with no systemd unit
- **WHEN** its active state is evaluated
- **THEN** the evaluation uses port and process rather than unit state and does not error
  on the missing unit

<!-- merged from change delta local-llm-proxy.md (a1c41f28f7d1) -->

### Requirement: Provider configuration declares data residency

`tickets.provider_config` SHALL carry a `data_residency` column with exactly two
permitted values: `on_premises` and `external`. The value states who operates the
machine that processes the payload, not the legal jurisdiction it sits in.

The migration SHALL set every existing row to `external`. Residency is therefore
fail-closed: a provider is treated as external until someone declares otherwise, so a
forgotten entry causes a refusal rather than a silent transfer.

The existing `eu_endpoint` column SHALL remain untouched and SHALL NOT be reused for this
purpose. It answers a different question — a vendor's EU endpoint is inside the EU and
still outside this project's infrastructure — and overloading it would destroy the
ability to express both facts.

#### Scenario: Existing rows default to external

- **GIVEN** provider rows that predate the migration
- **WHEN** the migration has run
- **THEN** every one of them carries `data_residency = 'external'`

#### Scenario: An invalid residency value is rejected

- **GIVEN** an attempt to write a `data_residency` value other than `on_premises` or
  `external`
- **WHEN** the write is executed
- **THEN** the database rejects it

### Requirement: The coaching path refuses external providers

Any LLM request carrying coaching or questionnaire content SHALL resolve its provider
only if that provider declares `data_residency = 'on_premises'`. On any other value —
including a missing declaration — the request SHALL fail with an error naming the
provider and the reason, and SHALL NOT transmit the payload.

There SHALL be no fallback to another provider on refusal. This mirrors ADR-004, where
the same principle already governs embeddings: a clear failure beats a silently wrong
result. Here the wrong result would be an unnoticed transfer of client data.

The refusal SHALL happen before any network call is attempted, so that a misconfiguration
cannot leak the payload while producing an error afterwards.

#### Scenario: A session on an external provider is refused

- **GIVEN** a coaching session whose provider config declares `external`
- **WHEN** a generation is requested
- **THEN** it fails with an error naming the provider, and no request reaches the provider

#### Scenario: A session on an on-premises provider proceeds

- **GIVEN** a coaching session whose provider config declares `on_premises`
- **WHEN** a generation is requested
- **THEN** the request proceeds normally

#### Scenario: A missing declaration is treated as external

- **GIVEN** a provider config whose `data_residency` is absent or null
- **WHEN** a coaching generation is requested
- **THEN** it is refused exactly as an explicit `external` would be

#### Scenario: Refusal precedes the network call

- **GIVEN** a coaching session on an external provider and an unreachable endpoint
- **WHEN** a generation is requested
- **THEN** the error names the residency refusal, not a connection failure — proving the
  check ran first

### Requirement: The proxy offers a local-only request mode

The llm-proxy SHALL accept a request property that forbids serving the request from a
backend of a remote kind. Under this mode the proxy SHALL select only local backends and
SHALL fail when none is available, instead of substituting a remote one.

This exists so that coaching traffic keeps the proxy's slot queue and loadout management
instead of addressing a backend directly, while never inheriting the priority chain's
fallback to `openai-remote`.

The mode SHALL interact with draining as follows: while a training lock drains the local
backends (see the GPU arbitration change), a local-only request SHALL fail. That failure
is the intended behaviour — the alternative is the transfer this change exists to
prevent.

#### Scenario: A local-only request is not served by a remote backend

- **GIVEN** a request marked local-only, no healthy local backend, and a healthy remote one
- **WHEN** the proxy selects a backend
- **THEN** it fails, and the remote backend is not used

#### Scenario: A local-only request is served locally when possible

- **GIVEN** a request marked local-only and a healthy local backend
- **WHEN** the proxy selects a backend
- **THEN** it is served by the local backend

#### Scenario: Draining makes local-only requests fail rather than escape

- **GIVEN** a held training lock draining the local backends, and a healthy remote backend
- **WHEN** a local-only request arrives
- **THEN** it fails and the remote backend is not used

#### Scenario: Ordinary requests keep their fallback

- **GIVEN** a request NOT marked local-only and no healthy local backend
- **WHEN** the proxy selects a backend
- **THEN** it is served by the remote backend as before

<!-- merged from change delta local-llm-proxy.md (e8843681fa39) -->

### Requirement: bge-CPU loadouts start in parallel without an exclusiveGroup

The two bge-CPU loadouts (`bge-embed-cpu`, `bge-rerank-cpu`) SHALL NOT share an `exclusiveGroup`
and SHALL be startable simultaneously. `exclusiveGroup` models VRAM exclusivity — both loadouts
run CPU-bound (`args.ngl: 0`, `env.CUDA_VISIBLE_DEVICES: ""`) and allocate no VRAM, so the group
that previously serialized them (embedding and reranking are the two halves of the same RAG query)
has no justification.

The CPU-bound configuration SHALL remain in place and SHALL stay guarded by
`tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats`; that suite's group-absence assertion
SHALL anchor on a control group (a known GPU loadout reports `chat-gpu`) instead of asserting
that any group exists on the bge loadouts (T002356-M1).

`tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats` SHALL assert that starting the second
bge-CPU loadout while the first runs succeeds without `exclusive_conflict`.

#### Scenario: Both bge-CPU loadouts run simultaneously

- **GIVEN** `bge-rerank-cpu` is active on port 8096
- **WHEN** `POST /admin/loadouts/bge-embed-cpu/start` is requested
- **THEN** the start succeeds (no `exclusive_conflict`) and both `/health` endpoints answer `200`

#### Scenario: The guard checks group absence via a control group

- **GIVEN** a known GPU loadout (`gptoss-context`) reports `exclusiveGroup: "chat-gpu"`
- **WHEN** the spec suite asserts the bge-CPU loadouts are not in `chat-gpu`
- **THEN** the assertion holds without requiring any group to exist on the bge loadouts

<!-- merged from change delta local-llm-proxy.md (918e9799efb5) -->

### Requirement: Kontextzahl-Guard prueft einen Toleranzkorridor statt Punktgleichheit

Der Guard-Test `tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats` SHALL die deklarierte
Kontextzahl eines `--fit`-Loadouts (z.B. `gemma26-factory.limit.context` in
`.opencode/agent-models.jsonc`) gegen den LAUFENDEN Server pruefen, indem er einen Toleranzkorridor
um den Live-Wert anlegt: `declared` muss innerhalb `[live * 0.8, live * 1.2]` liegen. Der Test SHALL
NICHT auf Punktgleichheit pruefen, weil `--fit` den `n_ctx` zur Ladezeit aus dem zum Startzeitpunkt
FREIEN VRAM bestimmt und dieser Betrag zwischen zwei Starts desselben Loadouts schwankt (gemessen
88832–99840). Die statische Deklaration SHALL bestehen bleiben, weil opencode sie zur Laufzeit fuer
Auto-Compact (fasst bei 95 % der Grenze zusammen) benoetigt.

#### Scenario: Deklaration liegt im Korridor um den Live-Wert

- **GIVEN** ein `gemma26-factory`-Server laeuft auf `:8091` und meldet per `/props` einen Live-`n_ctx`
- **WHEN** der Guard-Test die deklarierte Kontextzahl (97840) mit dem Live-Wert vergleicht
- **THEN** der Test besteht, solange `declared` innerhalb `[live * 0.8, live * 1.2]` liegt — fuer alle
  gemessenen Live-Werte (88832, 99328, 99840)

#### Scenario: n_ctx_train-Regression faellt weiterhin durch

- **GIVEN** die deklarierte Kontextzahl faellt auf den Modell-Default `n_ctx_train` (262144) zurueck
- **WHEN** der Guard-Test diesen Wert gegen den Live-Wert (~88832) prueft
- **THEN** der Test schlaegt fehl, weil 262144 ausserhalb des ±20 %-Korridors liegt

<!-- merged from change delta local-llm-proxy.md (9c1e92f4d6c6) -->

<!-- merged from change delta local-llm-proxy.md (118b27dbff37) -->

### Requirement: Health probe authenticates like the forwarding path

The health probe SHALL carry the same credential as the request-forwarding path. When a backend
declares an `api_key_env` and that variable resolves to a non-empty value, the probe request to
`GET {baseUrl}/models` SHALL send `Authorization: Bearer <key>`. When a backend declares no
`api_key_env`, the probe SHALL send no `Authorization` header, so local llama.cpp servers keep
their current behaviour.

A backend that answers the authenticated probe successfully SHALL be reported as healthy and its
model catalogue SHALL enter discovery — the credential state of the probe MUST NOT be able to
mark a reachable backend as dead.

#### Scenario: Remote backend with a resolvable key is healthy

- **GIVEN** an enabled backend of kind `openai-remote` whose `api_key_env` resolves to the value
  the remote API accepts
- **AND** the remote API answers `GET /v1/models` with HTTP 401 when no credential is presented
- **WHEN** the discovery loop probes that backend
- **THEN** the probe carries `Authorization: Bearer <key>`, the backend is reported healthy, and
  the model ids from the response enter the discovery catalogue

#### Scenario: Remote backend without a resolvable key stays unhealthy

- **GIVEN** an enabled backend of kind `openai-remote` whose `api_key_env` is unset in the
  process environment
- **WHEN** the discovery loop probes that backend
- **THEN** no `Authorization` header is sent, the backend is reported unhealthy, and no model ids
  from it enter the catalogue

#### Scenario: Local backend is probed without a credential

- **GIVEN** an enabled backend that declares no `api_key_env`
- **WHEN** the discovery loop probes that backend
- **THEN** the probe request carries no `Authorization` header

### Requirement: A failed probe records why it failed

A probe that transitions a backend from healthy to unhealthy SHALL emit exactly one log line
naming the backend and the reason — an HTTP status code when the backend answered, the error
otherwise. The line SHALL NOT be repeated while the backend stays unhealthy, so interval polling
cannot flood the journal.

The rationale is diagnostic separability: an authentication failure (HTTP 401) and an
unreachable host produce the same `healthy: false` today, which is why a misconfigured
credential can persist unnoticed.

#### Scenario: Authentication failure is distinguishable from unreachability

- **GIVEN** a healthy backend whose remote API starts answering the probe with HTTP 401
- **WHEN** the discovery loop probes it twice in a row
- **THEN** exactly one log line is emitted, and it names the backend and the status code 401

#### Scenario: A backend that stays unhealthy does not repeat its log line

- **GIVEN** a backend that is already unhealthy
- **WHEN** the discovery loop probes it again with the same failure
- **THEN** no further log line is emitted for that backend

### Requirement: Every proxy test file is registered in a runner

Every `scripts/llm-proxy/*.test.mjs` file SHALL be referenced by the `test:llm-proxy` task in
`Taskfile.yml` and by the llm-proxy step in `.github/workflows/ci.yml`. A test file that exists
but runs in no target is not regression protection.

The lists in both files are hand-maintained and therefore structurally incomplete; the guard
below holds them against the files actually present on disk.

#### Scenario: An unregistered test file fails the guard

- **GIVEN** a file `scripts/llm-proxy/<name>.test.mjs` that appears in neither runner list
- **WHEN** the guard runs
- **THEN** it fails and names the unregistered file

#### Scenario: The current tree passes the guard

- **GIVEN** the repository as committed by this change
- **WHEN** the guard runs
- **THEN** it passes, and every test file under `scripts/llm-proxy/` is named in both runners

<!-- merged from change delta local-llm-proxy.md (2d798a96683d) -->

### Requirement: Local smoke-test tooling picks a deterministic, small model

The BATS suite under `tests/spec/local-llm-proxy/` that launches a short-lived real
`llama-server` process to verify UI-config seeding (`ui-config-seed.bats`) SHALL select the
model file deterministically by size rather than by filesystem enumeration order, and SHALL
exclude auxiliary files (`mmproj-*`, `*draft*`) from that selection, so the test's runtime does
not depend on which model happens to be found first on disk.

#### Scenario: Smallest eligible model file is chosen among multiple candidates

- **GIVEN** multiple `*.gguf` files of different sizes exist under the configured model roots
- **WHEN** the test selects a model to launch the short-lived `llama-server` with
- **THEN** it selects the file with the smallest byte size among the eligible candidates,
  independent of directory traversal order

#### Scenario: Auxiliary model files are never selected

- **GIVEN** the only `*.gguf` files present match `mmproj-*` or `*draft*`
- **WHEN** the test selects a model to launch the short-lived `llama-server` with
- **THEN** no candidate is selected and the caller is told none is available, rather than
  launching `llama-server` with an auxiliary (non-primary) weight file

<!-- merged from change delta local-llm-proxy.md (c626b6ff841e) -->

### Requirement: bge reaches the proxy through role-based routes

The proxy SHALL serve `POST /v1/embeddings` and `POST /v1/rerank` by resolving the **request
path** to a role (`embed`, `rerank`) and forwarding to that role's configured upstream chain.
Resolution SHALL NOT go through the chat model resolution, and the served models SHALL NOT appear
in `GET /v1/models`.

Keeping the two resolutions apart is the point of the requirement, not an implementation detail:
if embedding models entered `/v1/models`, a client that picks the first listed model could send a
chat completion to `bge-m3` — the failure class T003203 exists to remove.

Each role's chain SHALL be configured in `scripts/llm/loadouts.json` under the top-level key
`roles`, where a chain entry is either a loadout reference (`loadout:<slug>`) or an absolute
upstream URL. The chain order SHALL be honoured as written; the shipped default puts the local
CPU loadout first and the cluster port-forward second.

#### Scenario: An embedding request reaches a role upstream

- **GIVEN** the `embed` role declares a chain whose first entry answers
- **WHEN** a client sends `POST /v1/embeddings` to the proxy
- **THEN** the proxy answers `200` with the upstream body
- **AND** the response carries `x-llm-proxy-bge-upstream` naming the entry that served it

#### Scenario: Embedding models stay out of the chat model list

- **GIVEN** both bge roles are configured and reachable
- **WHEN** a client requests `GET /v1/models`
- **THEN** the response contains no bge model id

### Requirement: bge failover is request-driven, not health-probe-driven

Upstream selection SHALL be decided by the outcome of the forwarded request itself, NOT by a
health probe. A probe is unsound here: on 2026-08-09 the cluster endpoint accepted the connection
and never answered for over 60 seconds while its `/health` kept returning `200`
(`scripts/bge-mcp/server.mjs:105-111`, T002838). A health endpoint answers "is the process
alive", not "can it serve my request".

The proxy SHALL advance to the next chain entry on a connection error, on a timeout, and on a
`5xx` response. It SHALL NOT advance on a `4xx` response — a client-side error SHALL be passed
through unchanged, because retrying it across the chain converts an immediate error into a
multi-timeout stall. When every entry has been tried, the proxy SHALL answer `503` with a body
that names a reason **per entry** rather than a single aggregate message.

The per-request timeout SHALL default to 30000 ms, matching `BGE_MCP_UPSTREAM_TIMEOUT_MS` in the
shim so the two deadlines do not race.

#### Scenario: A dead first entry falls through to the second

- **GIVEN** the first chain entry refuses connections and the second answers
- **WHEN** a role request arrives
- **THEN** the proxy answers `200` and `x-llm-proxy-bge-upstream` names the second entry

#### Scenario: A silent first entry falls through after the timeout

- **GIVEN** the first chain entry accepts the connection and never answers
- **WHEN** a role request arrives
- **THEN** the proxy advances to the next entry once the timeout elapses rather than blocking
  the caller indefinitely

#### Scenario: A client error is passed through without failover

- **GIVEN** the first chain entry answers `400`
- **WHEN** a role request arrives
- **THEN** the proxy returns `400` to the caller and does not contact any further entry

#### Scenario: An exhausted chain reports each entry

- **GIVEN** every entry of a role's chain fails
- **WHEN** a role request arrives
- **THEN** the proxy answers `503` and the body names a distinct reason per entry

### Requirement: A role's loadout entry starts on demand within a bounded budget

When a chain entry is a loadout reference and that loadout is not running, the proxy SHALL start
it and wait at most 20000 ms for readiness. The bound exists so that a start attempt plus the
cluster fallback together stay below the shim's 30000 ms deadline; without it the caller would
abort while the proxy was still failing over. If the start fails or the budget elapses, the entry
SHALL count as failed and the chain SHALL advance — a loadout that will not start MUST NOT
swallow the request.

The bge-CPU loadouts are eligible for this because they declare no `exclusiveGroup` and allocate
no VRAM; starting them cannot evict a chat loadout from the GPU.

#### Scenario: A stopped loadout entry is started and then serves

- **GIVEN** the first chain entry is a loadout reference and the loadout is stopped
- **WHEN** a role request arrives and the loadout becomes ready within the budget
- **THEN** the proxy forwards to it and `x-llm-proxy-bge-upstream` names that loadout

#### Scenario: A loadout that will not start does not swallow the request

- **GIVEN** the first chain entry is a loadout that fails to become ready within the budget
- **WHEN** a role request arrives and a later entry is reachable
- **THEN** the proxy answers from the later entry instead of failing the request

### Requirement: The gateway-consumer lint covers the bge surfaces

The static lint (`tests/spec/local-llm-proxy/gateway-consumer-lint.bats`) SHALL additionally track
`scripts/bge-mcp/bge-mcp.service` and `scripts/openspec-embed-local.sh`, and SHALL additionally
reject the bge backend ports `:8081`, `:8095` and `:8096` in those tracked surfaces. Comment lines
stay exempt, as with the existing literals, so retired configurations remain documentable.

`scripts/llm/loadouts.json` SHALL be exempt from this lint. Backend addresses belong there by
construction — it is the file that defines the chains — exactly as the registry seeds are already
exempt. Without the exemption the lint would forbid the configuration surface this change
introduces.

#### Scenario: A reintroduced direct backend port fails the lint

- **GIVEN** a tracked bge consumer surface carries a non-comment `:8081` literal
- **WHEN** the spec BATS suite runs
- **THEN** the lint fails and names that file

#### Scenario: The chain configuration itself does not trip the lint

- **GIVEN** `scripts/llm/loadouts.json` declares role chains containing `http://127.0.0.1:8081`
- **WHEN** the lint runs
- **THEN** it passes, because the configuration file is exempt by construction

<!-- merged from change delta local-llm-proxy.md (0ea73891c49f) -->

### Requirement: A loadout can be disabled without being deleted

A loadout entry SHALL accept an optional boolean field `enabled`, defaulting to `true` when
absent. A loadout with `enabled: false` SHALL be refused by the explicit start path and SHALL NOT
be selected by the auto-start path; the refusal SHALL name the loadout and state that it is
disabled, so the caller can tell "disabled" apart from "failed to start".

The field exists because deleting is the only way to retire a loadout today, and deleting takes
the measured `notes` with it. The next maintainer then re-adds the loadout without the reasoning
that retired it. An explicit `enabled: false` beside intact `notes` is self-documenting and
reuses the vocabulary the backend registry already has.

#### Scenario: A disabled loadout refuses an explicit start

- **GIVEN** a loadout declares `enabled: false`
- **WHEN** a client requests its start
- **THEN** the request is refused with a message naming the loadout as disabled
- **AND** no unit is started for it

#### Scenario: A loadout without the field stays startable

- **GIVEN** a loadout declares no `enabled` field
- **WHEN** a client requests its start
- **THEN** the start proceeds as before, because the field defaults to `true`

#### Scenario: A disabled loadout is not chosen by auto-start

- **GIVEN** a disabled loadout would otherwise satisfy an auto-start request
- **WHEN** the auto-start path selects a loadout
- **THEN** the disabled loadout is not selected

#### Scenario: The schema rejects a non-boolean value

- **GIVEN** a loadout declares `enabled` with a non-boolean value
- **WHEN** the configuration is parsed
- **THEN** parsing fails naming the loadout and the field

### Requirement: Dominated chat loadouts are retired rather than left selectable

`gptoss-context` and `devstral-quality` SHALL be disabled. Because every chat loadout shares
`exclusiveGroup "chat-gpu"` and only one occupies the GPU at a time, a loadout that leads in no
dimension costs switching time and mis-selection rather than memory. `devstral-quality`
(33.536 context, 59 tok/s) leads in no dimension against the remaining loadouts.

Their `notes` SHALL be retained and SHALL state why they were retired, so the measurements that
justified the decision survive the decision.

`qwen3-coder-30b` SHALL remain inactive and SHALL NOT be reactivated: at an equal VRAM footprint
it runs a larger model at a far more aggressive quantisation (UD-IQ3_XXS) than the natively
formatted alternative, offers less context, and its only claimed advantage — agentic depth — has
no measurement.

#### Scenario: The retired loadouts carry their reason

- **GIVEN** a loadout was disabled by this change
- **WHEN** its configuration entry is read
- **THEN** it is marked disabled and its notes state the reason

### Requirement: No agent definition points at a disabled loadout

`.opencode/agent-models.jsonc` SHALL NOT reference a loadout that is disabled — neither from a
family subagent, nor from a tab-selectable primary, nor from an orchestrator permission list. The
existing drift guard `tests/spec/local-llm-proxy/opencode-agent-model-drift.bats` SHALL be
extended to fail on such a reference.

An agent whose loadout is disabled does not disappear; it fails on first dispatch. The guard is
the protection against a half-completed retirement, in which the loadout is off but the agents
still point at it.

#### Scenario: A reference to a disabled loadout fails the guard

- **GIVEN** an agent definition names a loadout that is disabled in the configuration
- **WHEN** the drift guard runs
- **THEN** it fails and names both the agent and the loadout

#### Scenario: The guard does not pass vacuously

- **GIVEN** the agent configuration is present and declares at least one local loadout model
- **WHEN** the drift guard runs
- **THEN** it evaluates a non-empty candidate set, so a passing result is evidence rather than an
  artefact of an empty list

### Requirement: The ingest loadout runs without a reasoning phase

The `brain-ingest` loadout SHALL run with reasoning disabled. Its task is format fidelity at
`temperature 0.2` under six hard constraints, not deliberation; a reasoning phase spends tokens
without improving adherence.

`brain-ingest` SHALL remain enabled. It is a separate loadout that happens to run the same model
file as the retired `gptoss-context`; retiring the chat loadout MUST NOT retire the ingest one.

#### Scenario: Ingest keeps running while the chat loadout is retired

- **GIVEN** `gptoss-context` is disabled
- **WHEN** the configuration is read
- **THEN** `brain-ingest` is still enabled and still declares its own port

#### Scenario: The ingest loadout declares no reasoning

- **GIVEN** the `brain-ingest` loadout entry
- **WHEN** its arguments are read
- **THEN** reasoning is not set to an enabling value

<!-- merged from change delta local-llm-proxy.md (62e5238448e7) -->

### Requirement: Loadout-Ports und lokale Port-Forwards sind disjunkt

Kein in `scripts/llm/loadouts.json` deklarierter Port SHALL zugleich die lokale Seite eines
`port-forward` aus `scripts/bge-mcp/*.service` sein. Loadouts untereinander duerfen Ports
teilen, solange sie dieselbe `exclusiveGroup` tragen — ein Loadout und ein Port-Forward
koennen dagegen nie koexistieren, weil der Forward permanent laeuft.

Die Pruefung SHALL ausschliesslich Repo-Artefakte lesen und niemals die Laufzeitbelegung,
damit sie in CI den Zustand des Codes misst statt der Ausstattung des Runners. Sie SHALL
zuerst belegen, dass beide Extraktionen nicht leer sind, damit eine ins Leere laufende
Extraktion laut scheitert statt vakuos zu bestehen.

Das Loadout `brain-ingest`, der Default in `scripts/brain-ingest.sh` und die base_url des
Backends `llamacpp-bonsai` SHALL denselben Port nennen.

#### Scenario: Ein Loadout beansprucht einen Forward-Port

- **GIVEN** ein Loadout in `loadouts.json` nennt Port 8093
- **AND** `bge-forward-rerank.service` legt einen `port-forward` auf dieselbe lokale Portnummer
- **WHEN** die Testsuite laeuft
- **THEN** schlaegt die Pruefung fehl und nennt den betroffenen Port samt Loadout-Slug

#### Scenario: brain-ingest nennt ueberall denselben Port

- **GIVEN** `loadouts.json`, `brain-ingest.sh` und die Backend-Migration nennen alle Port 8100
- **WHEN** die Testsuite laeuft
- **THEN** besteht die Pruefung

#### Scenario: Eine Deklaration laeuft weg

- **GIVEN** der Loadout-Port wird geaendert, der Default in `brain-ingest.sh` aber nicht
- **WHEN** die Testsuite laeuft
- **THEN** schlaegt die Pruefung fehl

<!-- merged from change delta local-llm-proxy.md (e2f80def8d26) -->

### Requirement: Qwen3-Coder is available as an additive chat loadout

`scripts/llm/loadouts.json` SHALL declare a loadout `qwen3-coder` serving
Qwen3-Coder-30B-A3B-Instruct (UD-Q4_K_XL) on port 8097 within `exclusiveGroup: "chat-gpu"`, and
`tickets.llm_proxy_backends` SHALL carry a matching enabled entry for that port on both brands.

Adding this loadout SHALL NOT change model routing: no row in `tickets.provider_config` and no
row in `tickets.factory_model_slots` may be modified by this change. The loadout is started on
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
- **WHEN** `tickets.provider_config` and `tickets.factory_model_slots` are read back
- **THEN** no row references `qwen3-coder`, and the previously configured model ids for every
  tier are unchanged

#### Scenario: Loadout declares no pinned context or layer count

- **GIVEN** the `qwen3-coder` entry with `fit.enabled` set to true
- **WHEN** its `args.ctx` and `args.ngl` are read
- **THEN** both are null, satisfying the existing guard that no loadout using `--fit` pins either
  value

<!-- merged from change delta local-llm-proxy.md (f914be33bda0) -->

### Requirement: Loadout auxiliary files SHALL resolve against the model roots

Every loadout that declares an auxiliary model file — a multimodal projector
(`args.mmprojPath`) or a speculative draft head (`speculative.draftModelPath`) — SHALL have that
file resolvable against at least one entry of `modelRoots`. Loadouts marked
`"managed": "external"` are exempt, because they carry an identifier rather than a path.

An unresolvable auxiliary path is a silent failure: the server still starts, but without the
capability the entry was there to provide. This is distinct from an unresolvable `model`, which
prevents startup outright and is already covered by the T002753 guard.

#### Scenario: A declared projector file is missing from every model root

- **GIVEN** a loadout declares `args.mmprojPath` pointing at a file that exists in no `modelRoot`
- **WHEN** the auxiliary-file guard runs
- **THEN** the guard fails and names both the loadout slug and the offending field

#### Scenario: No model roots are present on the runner

- **GIVEN** none of the configured `modelRoots` exist on the machine running the tests
- **WHEN** the auxiliary-file guard runs
- **THEN** the guard skips with an explicit reason rather than reporting a false pass
- **AND** the skip decision is based on the absence of the roots, never on the check result

#### Scenario: The resolution mechanism itself is verified

- **GIVEN** the guard's own resolution helper
- **WHEN** it is handed a path that is guaranteed absent and a path that is guaranteed present
- **THEN** it reports the first as missing and the second as resolved
- **AND** this anchor runs independently of the registry contents, so a registry that declares no
  auxiliary files at all cannot make the guard pass vacuously

### Requirement: Speculative decoding SHALL be explicitly enabled, not merely configured

A loadout that declares `speculative.draftModelPath` SHALL also declare the speculative
implementation to use. `llama-server` defaults `--spec-type` to `none`: a draft head supplied via
`-md` alone is loaded into memory and never used, which costs VRAM and yields no speedup while
appearing correctly configured in both the registry and the process command line.

#### Scenario: A loadout declares a draft head

- **GIVEN** a loadout sets `speculative.draftModelPath`
- **WHEN** the runner builds the server argument vector
- **THEN** the argument vector contains an explicit `--spec-type` value
- **AND** that value is not `none`

<!-- merged from change delta local-llm-proxy.md (a6ae32b36b7d) -->