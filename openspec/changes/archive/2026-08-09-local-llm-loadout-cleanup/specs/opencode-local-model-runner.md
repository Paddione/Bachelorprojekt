# opencode-local-model-runner — Delta (T002753)

## ADDED Requirements

### Requirement: Declared context must be measured

Every model registered under the `llamacpp-local` provider in `.opencode/agent-models.jsonc`
SHALL declare a `limit.context` equal to the `n_ctx_slot` actually reported by `llama-server`
for that loadout's own configuration, and the source of the number SHALL be recorded in a
comment next to it. A declared context larger than the loaded one makes the agent plan for a
budget it does not have; a smaller one wastes capacity that was paid for in VRAM.

#### Scenario: A registered local model declares its measured context

- **GIVEN** a model entry under the `llamacpp-local` provider
- **WHEN** its `limit.context` is compared against the measurement recorded for its loadout
- **THEN** the two agree

#### Scenario: A local agent points at a loadout that still exists

- **GIVEN** an agent whose `model` field names `llamacpp-local/<slug>`
- **WHEN** the slug is looked up in `scripts/llm/loadouts.json`
- **THEN** a loadout with that slug is present

### Requirement: Agent naming matches the backing model

An agent whose name states a model family or a capability SHALL be backed by a model that
provides it. `gemma26-primary` and `gemma26-vision` named Gemma 26B while both pointed at
`gptoss-context`, and `gemma26-vision` promised vision while being text-only — the file's own
comment recorded the drift as "der Name stammt aus der Gemma-Zeit" instead of resolving it.

#### Scenario: A vision-named agent can process images

- **GIVEN** an agent whose name or description states vision capability
- **WHEN** its backing loadout is inspected
- **THEN** the loadout declares an `mmprojPath` that resolves to an existing file
