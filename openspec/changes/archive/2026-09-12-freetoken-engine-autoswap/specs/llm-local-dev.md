## ADDED Requirements

### Requirement: Engine Auto-Swap on FreeToken Model Selection

When the user selects a `freetoken-local` model in the model picker, the plugin SHALL
switch the resident FreeToken engine to the engine model mapped to the selected alias.
The mapping SHALL be resolved from the plugin-internal alias→engine table (engine model,
port, args, contextLimit). After a successful switch the plugin SHALL update the
declared context limit for the active alias.

#### Scenario: Different engine model selected

- **GIVEN** the user selects a `freetoken-local` alias whose mapped engine model differs from the running engine model
- **WHEN** the plugin event hook observes `session.next.model.switched`
- **THEN** the plugin SHALL call `POST /engine/switch` with `{model, port, args, force: true}` (or `POST /engine/start` if the engine is stopped)
- **AND** the plugin SHALL update the declared context limit for the active alias

#### Scenario: Same engine model, different alias

- **GIVEN** the user selects a `freetoken-local` alias whose mapped engine model equals the running engine model (e.g. `active` → `active-thinking`)
- **WHEN** the plugin event hook observes `session.next.model.switched`
- **THEN** the plugin SHALL NOT call the engine control API
- **AND** the plugin SHALL only update the declared context limit and alias name

### Requirement: Engine Stop on Non-FreeToken Model Selection

When the user selects a model that is not a `freetoken-local` model, the plugin SHALL
stop the resident FreeToken engine to free VRAM.

#### Scenario: Non-FreeToken model selected

- **GIVEN** the user selects a model outside the `freetoken-local` provider (e.g. `llamacpp-local`)
- **WHEN** the plugin event hook observes `session.next.model.switched`
- **THEN** the plugin SHALL call `POST /engine/stop`

### Requirement: Degraded Failure Path on Engine Switch

When an engine switch or stop fails, the plugin SHALL notify the user and keep the
previous engine state running. The failure SHALL NOT block the already-switched client.

#### Scenario: Engine switch fails

- **GIVEN** the engine control API returns an error for `POST /engine/switch`
- **WHEN** the plugin event hook handles the model switch
- **THEN** the plugin SHALL surface a notification with the error
- **AND** the plugin SHALL leave the previously running engine untouched

### Requirement: Fetch-Wrapper Engine Consistency Guard

The plugin fetch wrapper SHALL verify that the running engine model matches the model
expected for the active alias. On mismatch the wrapper SHALL perform a synchronous
engine switch before proxying the request.

#### Scenario: Engine model drifted from expected model

- **GIVEN** the running engine model differs from the model expected for the active alias
- **WHEN** a request is proxied through the plugin fetch wrapper
- **THEN** the wrapper SHALL switch the engine to the expected model before forwarding the request

### Requirement: Repo Plugin SSOT Sync

The repository copy of the freetoken-active plugin SHALL match the live global plugin
copy, including the system-merge fix (all system messages merged into position 0).

#### Scenario: Repo plugin is stale

- **GIVEN** the repo copy of `.opencode/plugin/freetoken-active.ts` lacks the system-merge fix present in the global copy
- **WHEN** the change is implemented
- **THEN** the repo copy SHALL contain the same system-merge logic as the global copy

### Requirement: BATS Coverage for Auto-Swap Logic

The auto-swap behavior SHALL be covered by BATS tests under `tests/spec/llm-local-dev/`
following the existing `tests/spec/llm-local-dev.bats` pattern.

#### Scenario: Auto-swap tests run

- **GIVEN** BATS tests for the auto-swap logic exist under `tests/spec/llm-local-dev/`
- **WHEN** the test suite runs
- **THEN** the tests SHALL pass and cover alias mapping, switch/stop/start dispatch, same-model context-limit-only updates, and the failure path
