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

#### Scenario: A different exclusive group does not block

- **GIVEN** only `bge-embed-cpu` (group `bge-cpu`) is active
- **WHEN** `POST /admin/loadouts/gemma26-factory/start` is requested
- **THEN** the start proceeds

#### Scenario: Both start paths share one conflict definition

- **GIVEN** the same set of active loadouts
- **WHEN** the conflict is evaluated for the auto-start path and for the explicit start path
- **THEN** both report the same blocking slug and group

<!-- merged from change delta local-llm-proxy.md (e876c4926c38) -->

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