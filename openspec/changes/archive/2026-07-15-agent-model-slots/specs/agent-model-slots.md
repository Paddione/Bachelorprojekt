## ADDED Requirements

### Requirement: Versioned opencode agent-model source of truth

The system SHALL store the opencode `agent` block and the relevant
`provider.lmstudio.models` entries in a versioned repo file
`.opencode/agent-models.jsonc`, and SHALL NOT rely on the unversioned
`~/.config/opencode/opencode.jsonc` as the sole source of truth. The versioned
file SHALL NOT contain any `qwythos` or `qwythos-hq` agent, and SHALL contain a
single-session implementation/planning agent bound to the `Qwen3-14B`
(`lmstudio-community/Qwen3-14B-GGUF`, `Q4_K_M`) model. The multi-agent fan-out
model (`qwen3.5-9b@iq4_xs`, agent `qwen35-iq4`) SHALL remain unchanged.

#### Scenario: Qwythos removed and Qwen3-14B present

- **GIVEN** the versioned `.opencode/agent-models.jsonc`
- **WHEN** an operator inspects the `agent` block
- **THEN** neither `qwythos` nor `qwythos-hq` is present
- **AND** a single-session agent references model `lmstudio/qwen3-14b@q4_k_m`
- **AND** the `qwen35-iq4` fan-out agent is unchanged

### Requirement: Idempotent sync from repo to opencode host config

The system SHALL provide `scripts/opencode-sync-agents.sh` that writes the
`agent` block from `.opencode/agent-models.jsonc` into
`~/.config/opencode/opencode.jsonc`, replacing the target `agent` block wholesale
(so removed agents such as `qwythos` disappear) and additively merging the
`provider.lmstudio.models` entries. The script SHALL NOT modify any other
top-level key of the target file, and SHALL be idempotent (re-running produces no
further change).

#### Scenario: Repeated sync is a no-op after first apply

- **GIVEN** a target `~/.config/opencode/opencode.jsonc` already synced once
- **WHEN** `scripts/opencode-sync-agents.sh` runs again
- **THEN** the target `agent` block equals the source `agent` block
- **AND** unrelated top-level keys (`mcp`, `plugin`, `experimental`) are unchanged

### Requirement: Interactive model picker for opencode agents

The system SHALL provide `scripts/agent-model-select.sh`, an fzf-based picker that
lists the models available in `.opencode/agent-models.jsonc`, writes the chosen
model back into that file for the selected agent, and then invokes
`scripts/opencode-sync-agents.sh`.

#### Scenario: Picker updates source and triggers sync

- **GIVEN** `.opencode/agent-models.jsonc` with multiple candidate models
- **WHEN** an operator selects a model for an agent via the picker
- **THEN** the agent's `model` in `.opencode/agent-models.jsonc` is updated
- **AND** `scripts/opencode-sync-agents.sh` is invoked afterwards

### Requirement: Per-phase factory model slots persisted in Postgres

The system SHALL persist a per-phase factory model slot in a `tickets`-schema
table with one row per pipeline phase (`scout`, `plan`, `implement`, `verify`,
`deploy`), each carrying a chosen `provider` and `model_id`. The factory provider
router (`scripts/factory/route-provider.sh`, `routeProviderSync` in
`scripts/factory/pipeline.js`) SHALL consult this table for the active phase
before applying the existing tier-based (`haiku`/`sonnet`/`opus`) routing. When no
slot row exists for the phase, or the emergency fallback path is taken, the
existing tier logic SHALL apply unchanged.

#### Scenario: Slot row wins over tier default

- **GIVEN** a `factory_model_slots` row for phase `implement` with a provider and model
- **WHEN** the router resolves a provider for the `implement` phase
- **THEN** the slot's provider and model are returned

#### Scenario: Missing slot falls back to tier logic

- **GIVEN** no `factory_model_slots` row for phase `plan`
- **WHEN** the router resolves a provider for the `plan` phase
- **THEN** the existing tier-based `provider_config` routing is used

### Requirement: Admin UI to edit factory model slots

The system SHALL expose the per-phase slots through an authenticated admin API
(`website/src/pages/api/factory-model-slots.ts`, GET and PUT) and a Svelte
component (`website/src/components/factory/FactoryModelSlots.svelte`) reachable
from the pipeline admin surface, offering one model dropdown per phase fed from
the available-model catalog. The API SHALL enforce the same admin auth check used
by the other factory admin endpoints and SHALL reject unknown phase values.

#### Scenario: Non-admin is rejected

- **GIVEN** a request without an admin session
- **WHEN** it calls GET or PUT on `/api/factory-model-slots`
- **THEN** the response status is 401 or 403

#### Scenario: Invalid phase rejected

- **GIVEN** an admin PUT with a phase not in the allowed set
- **WHEN** the endpoint validates the body
- **THEN** it responds 400 without writing to the table
