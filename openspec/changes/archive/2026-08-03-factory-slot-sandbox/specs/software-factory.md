# Delta: software-factory — Factory Slot Sandbox

## ADDED Requirements

### Requirement: Pipeline-Slot → llama.cpp-Slot-Kopplung

The system SHALL map each `pipeline_slot` (1..N, stored in `tickets.tickets`) to a
corresponding llama.cpp slot ID (0..N-1) and persist the mapping in
`tickets.pipeline_slot_meta`. An agent session claiming pipeline_slot N SHALL
consistently use llama.cpp slot N-1 for all inference requests during its lifetime.

#### Scenario: Slot claim persists mapping

- **GIVEN** `FACTORY_SLOTS_PER_BRAND=3` und keine belegten Slots
- **WHEN** `slots.sh claim T000123` aufgerufen wird und pipeline_slot 1 zugewiesen bekommt
- **THEN** `tickets.pipeline_slot_meta` enthält `{"llama_slot_id": 0, "claimed_at": "<timestamp>"}`
- **AND** `slots.sh slot-id T000123` gibt `0` zurück

#### Scenario: Zwei Tickets kollidieren nicht im KV-Cache

- **GIVEN** Ticket A in pipeline_slot 1 (llama_slot_id=0) und Ticket B in pipeline_slot 2 (llama_slot_id=1)
- **WHEN** beide Tickets Inferenz-Requests an den llm-proxy senden
- **THEN** nutzt Ticket A konsistent llama.cpp Slot 0 und Ticket B konsistent Slot 1
- **AND** die KV-Caches der beiden Slots interferieren nicht

#### Scenario: Slot-Release räumt Mapping auf

- **GIVEN** Ticket T000123 hat pipeline_slot 1 mit llama_slot_id 0
- **WHEN** `slots.sh release T000123` aufgerufen wird
- **THEN** `pipeline_slot` ist NULL
- **AND** `pipeline_slot_meta` ist NULL oder auf released gesetzt

### Requirement: Agent-Session-Containerisierung (Sandbox Stufe 2)

The system SHALL execute agent sessions (`claude -p` / `opencode run`) inside Docker
containers with per-slot resource limits, network isolation, and filesystem isolation.
`sandbox-run.sh` SHALL support `--agent` mode that wraps the entire agent process,
not just individual sub-commands.

#### Scenario: Agent-Session läuft im Container

- **GIVEN** `FACTORY_SANDBOX=docker` und `sandbox-run.sh --agent <worktree> --slot 1 -- claude -p "<prompt>"`
- **WHEN** der Container startet
- **THEN** läuft der Agent-Prozess im Container mit `--network factory-sandbox-slot-1`
- **AND** `/work` ist der Worktree des Tickets
- **AND** `/tmp` ist ein dediziertes TMPDIR für Slot 1
- **AND** der Container hat cgroup-Limits `--cpus=2 --memory=4g`

#### Scenario: Netzwerk default-deny pro Slot

- **GIVEN** ein Agent-Container auf `factory-sandbox-slot-1`
- **WHEN** der Agent versucht, eine nicht-allowlistete Adresse zu erreichen
- **THEN** wird die Verbindung blockiert
- **AND** Verbindungen zu `api.anthropic.com`, `registry.npmjs.org`, `github.com` sind erlaubt

#### Scenario: Ohne Docker fällt Sandbox auf host zurück

- **GIVEN** Docker ist nicht verfügbar
- **WHEN** `sandbox-run.sh --agent` aufgerufen wird
- **THEN** läuft der Agent als Host-Prozess (wie heute)
- **AND** eine Warnung wird geloggt

### Requirement: llm-proxy Slot-Routing

The llm-proxy SHALL route inference requests to the correct llama.cpp slot based on
the `X-Slot-ID` request header, maintaining per-slot request queues when the
llama.cpp server does not natively support slot-pinned requests.

#### Scenario: Slot-Routing via Header

- **GIVEN** der llm-proxy ist mit einem llama.cpp-Backend (`-np 3`) verbunden
- **WHEN** ein Request mit `X-Slot-ID: 1` eingeht
- **THEN** wird der Request in die Queue für Slot 1 eingereiht
- **AND** bei `max_inflight=1` pro Slot wird nur ein Request pro Slot gleichzeitig verarbeitet
- **AND** der Response-Header enthält `X-LLM-Proxy-Slot: 1`

#### Scenario: Fallback ohne X-Slot-ID

- **GIVEN** ein Request OHNE `X-Slot-ID` Header
- **WHEN** der llm-proxy den Request verarbeitet
- **THEN** wird der Request an einen beliebigen freien Slot weitergeleitet (heutiges Verhalten)

### Requirement: Multi-Slot-Loadout aktiv

The system SHALL run the Gemma model with `-np 3 -kvu` (3 slots, unified KV cache)
in production to support parallel agent sessions. The `gemma-multiagent` loadout
SHALL replace the current `gemma-factory` loadout as the active configuration.

#### Scenario: llama-server hat 3 Slots

- **GIVEN** der Gemma-Server ist mit dem `gemma-multiagent` Loadout gestartet
- **WHEN** `/slots` der llama.cpp-API abgefragt wird
- **THEN** werden 3 Slots mit Status `idle` gemeldet
- **AND** `total_slots` in `/props` ist 3
