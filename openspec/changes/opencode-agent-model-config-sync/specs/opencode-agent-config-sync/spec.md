## Purpose

Zentraler Synchronisations- und Validierungspfad für opencode-Agenten- und Modellkonfigurationen: die SSOT (.opencode/agent-models.jsonc) ist verlässlich, Stale-Einträge werden entfernt, Kontext-Limits sind gemessen und die gesamte Konfiguration ist für den Nutzer auf einen Blick sowie in nvim editierbar visualisiert.

## ADDED Requirements

### Requirement: Central model inventory with staleness annotation

The system SHALL maintain a single source of truth for opencode agent-models configuration in `.opencode/agent-models.jsonc` that lists every provider, model, and agent referenced by the opencode harness.

The inventory SHALL annotate each model entry with a context limit that reflects a measured value, not only an advertised `max_model_len` value, and SHALL record the measurement date next to the limit.

#### Scenario: Inventoried model carries measured limit

- **GIVEN** a model entry exists in `.opencode/agent-models.jsonc`
- **WHEN** the inventory is reviewed
- **THEN** the entry carries a context limit annotated with the measurement date it was derived from

#### Scenario: Model without existence proof is flagged

- **GIVEN** a model entry in the SSOT has no matching loadout or live provider verification
- **WHEN** the inventory is validated
- **THEN** the model is marked as `stale` and is removed from the SSOT

### Requirement: All configuration layers stay consistent with the SSOT

The system SHALL keep every opencode configuration layer — global user config (`~/.config/opencode/opencode.jsonc`), repository config (`.opencode/opencode.jsonc`), `AGENTS.md` routing tables, `docs/agent-guide/registry/agents.yaml`, and `.claude/agents/*.md` — consistent with `.opencode/agent-models.jsonc`.

The system SHALL synchronize the global user config from the SSOT via `scripts/opencode-sync-agents.sh`, and the synchronization SHALL be idempotent: running it twice yields an identical result with an empty dry-run diff.

Configurations SHALL NOT duplicate model definitions: a provider referenced in the global config that points to a decommissioned endpoint SHALL be updated to the live provider definition from the SSOT.

#### Scenario: Global config diverges in provider endpoint

- **GIVEN** the global user config references a provider endpoint that no longer serves models (e.g. a decommissioned port)
- **WHEN** the sync script runs with dry-run
- **THEN** the diff shows exactly the stale provider definition and the sync updates the global config to the SSOT state

#### Scenario: Sync is idempotent

- **GIVEN** a synchronized global config
- **WHEN** the sync script runs again with dry-run
- **THEN** the diff is empty

#### Scenario: Documentation tables match the SSOT

- **GIVEN** `AGENTS.md`, `agents.yaml`, or `.claude/agents/*.md` list agents and models
- **WHEN** they are checked against `.opencode/agent-models.jsonc`
- **THEN** no agent model, primary, or context limit differs from the SSOT

### Requirement: Measured context limit for resident models

The system SHALL calibrate the declared context limit of the FreeToken-resident model family (alias `active`) to a measured value below the server's advertised ceiling, so that long-running sessions complete without context overflow errors.

The system SHALL tune auto-compaction parameters (compaction buffer and keep-tokens) so compaction fires below the measured ceiling and preserves a working context window for repeated long workflows.

#### Scenario: Long-running session stays within the ceiling

- **GIVEN** the resident model with a calibrated limit
- **WHEN** a session grows toward the declared context limit
- **THEN** auto-compaction triggers before the measured ceiling and no `input sequence length exceeds` error occurs

### Requirement: Generated configuration visualization

The system SHALL provide a generated configuration overview (`docs/agent-guide/registry/config-overview.md`) that renders the SSOT as a Markdown tree: providers → models → agents, each annotated with context limit, measurement date, and status (`ok`, `stale`, `fehlt`, `unbelegt`).

The overview SHALL be reproducible from a script (`scripts/opencode-config-viz.sh`) and SHALL NOT be hand-edited; regeneration SHALL produce a deterministic, snapshot-identical result.

The system SHALL document how to edit the raw configuration files in nvim: JSONC syntax highlighting and `foldmethod=syntax` for folded structure.

#### Scenario: Overview is regenerated identically

- **GIVEN** an unchanged SSOT
- **WHEN** the viz script runs twice
- **THEN** both runs produce byte-identical Markdown

#### Scenario: Overview reflects staleness

- **GIVEN** a model removed from the SSOT
- **WHEN** the viz script runs
- **THEN** the removed model no longer appears in the overview and any orphaned agent reference is shown as `unbelegt`

### Requirement: No credentials in configuration files

The system SHALL NOT store API keys or secrets in any opencode configuration file; authentication SHALL reference the existing credential store (auth.json) instead.

#### Scenario: Config scan finds no secrets

- **GIVEN** all opencode configuration files
- **WHEN** they are scanned for credential material
- **THEN** no API key or secret literal is present in any configuration file
