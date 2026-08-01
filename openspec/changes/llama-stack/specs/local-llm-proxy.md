## ADDED Requirements

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
