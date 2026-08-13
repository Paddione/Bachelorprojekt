# sdlc-isolation — Delta-Spec

## Purpose

T002656 (Fragment des EPIC T002650): `sdlc:up` startet nach dem llm-proxy auch
das lokale Chat-Loadout (idempotent, via Proxy-Admin-API), der
`health-gate.sh` prüft zusätzlich Proxy-Readiness (`/health`) und
Loadout-Gesundheit, und `sdlc:down` stoppt das Loadout vor dem Proxy.
Kein `dev:up`-Task (bestehende Entscheidung: `dev:`-Namespace gehört dem
Staging-Stack).

## MODIFIED Requirements

### Requirement: Single Entry Point for the Local SDLC Stack

#### Scenario: Cold start brings the stack up

| | Before | After |
|---|---|---|
| Steps | cluster → stack → llm-proxy → health gate | cluster → stack → llm-proxy → **default chat loadout** → health gate |
| Exit semantics | Exit 0 only after the health gate reports every component ready | unchanged — now including the chat loadout |

### Requirement: Health Gate Reports Diagnosable Failure

| | Before | After |
|---|---|---|
| llm-proxy check | `/livez` only (liveness: process answering) | `/livez` **plus** `GET /health` readiness poll (ready only when a priority-1 backend group is healthy) **plus** `GET /admin/loadouts/status` (configured chat loadout running + healthy) |
| Failure naming | names the component and observed state | unchanged — readiness failures additionally name the `degraded` backends from the `/health` response |

#### Scenario: A partially started stack is not reported as success

| | Before | After |
|---|---|---|
| Case | one of the checked components is not ready | additionally: proxy answers `/livez` but `/health` returns 503 (`ready: false`) or the chat loadout is not `running`+`healthy` |
| Result | gate exits non-zero | gate exits non-zero and names `llm-proxy` / the loadout slug |

## ADDED Requirements

### Requirement: sdlc:up starts the local chat loadout before the health gate

`sdlc:up` SHALL start the configured local chat loadout after the llm-proxy
is running and before the health gate runs. The loadout SHALL be selected via
the environment variable `SDLC_LLM_LOADOUT`, defaulting to
`gemma26-throughput`. Starting SHALL be idempotent: a loadout that is already
running and healthy SHALL NOT be restarted. A loadout belonging to an
`exclusiveGroup` that another running loadout occupies SHALL fail with a
non-zero exit status and name the conflicting loadout, SHALL NOT stop the
conflicting loadout, and SHALL NOT be auto-started by the health gate.

Rationale: without an explicit start, the proxy only auto-starts loadouts on
the first matching request (T002336/T002616); a freshly started stack would
answer 404/503 until that first request. All chat loadouts share
`exclusiveGroup: chat-gpu` — at most one can run, so exactly one configurable
default is started, not every loadout.

#### Scenario: Stopped loadout is started and reported healthy

- **GIVEN** the llm-proxy is running and the configured chat loadout is stopped
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the loadout is started via the proxy admin API
- **AND** the health gate reports it as `running` and `healthy`
- **AND** the command exits 0 only after the loadout is healthy

#### Scenario: Repeated invocation is idempotent

- **GIVEN** the configured chat loadout is already running and healthy
- **WHEN** the operator runs `task sdlc:up` a second time
- **THEN** the loadout is not restarted and the command exits 0

#### Scenario: Conflicting exclusiveGroup loadout is named, not stopped

- **GIVEN** another loadout of the same `exclusiveGroup` (e.g. `chat-gpu`) is running
- **WHEN** the operator runs `task sdlc:up`
- **THEN** the command exits non-zero and names the conflicting loadout
- **AND** the conflicting loadout keeps running

### Requirement: sdlc:down stops the chat loadout before the proxy

`sdlc:down` SHALL stop the configured chat loadout before stopping the
llm-proxy. Stopping SHALL be best-effort: if the proxy is already unreachable
or the loadout is not running, the shutdown SHALL still complete successfully.

Rationale: loadout units are managed via `systemd-run` and outlive the proxy
process; stopping the proxy first would strand the llama-server on its port.

#### Scenario: Shutdown stops the loadout before the proxy

- **GIVEN** the SDLC stack is running with the chat loadout healthy
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the loadout is stopped before the llm-proxy is stopped
- **AND** the cluster is deleted afterwards

#### Scenario: Shutdown tolerates an already-stopped loadout

- **GIVEN** the SDLC stack is running but the chat loadout is already stopped
- **WHEN** the operator runs `task sdlc:down`
- **THEN** the shutdown completes without error
