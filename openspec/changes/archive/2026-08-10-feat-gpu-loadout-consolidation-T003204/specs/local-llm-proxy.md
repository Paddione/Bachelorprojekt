## ADDED Requirements

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
