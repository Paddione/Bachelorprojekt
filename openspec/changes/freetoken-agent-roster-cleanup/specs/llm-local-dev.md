## MODIFIED Requirements

### Requirement: Model-Agnostic Active Alias for FreeToken-Native Agents

The `freetoken-local` provider SHALL declare an alias model entry `active`
alongside the concrete checkpoint entries. Every local-family subagent
(`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`) and the single local
primary agent (`freetoken-primary`) SHALL reference `freetoken-local/active`
as its model. No other primary agent SHALL target the `freetoken-local`
provider.

Rationale: FreeToken serves one resident model at a time on a shared port and
ignores the `model` field of incoming requests (verified live 2026-08-23), so a
stable alias always reaches whichever checkpoint is resident — per-model agent
wiring would break on every `/engine/switch` (T014105). After the migration the
former per-loadout primaries (`gemma26-primary`, `gemma26-vision`,
`gptoss-primary`, `devstral-primary`, `gemma12-primary`,
`gemma26-throughput-primary`, `qwen38-primary`) became byte-identical clones of
`freetoken-primary` whose names reference retired loadouts; they are removed
instead of kept as lying aliases (T016419). The family names stay alive where
they still carry meaning: as subagent dispatch handles.

#### Scenario: Agents reference the alias

- **GIVEN** the agent blocks in `.opencode/agent-models.jsonc`
- **WHEN** the `model` field of each local subagent and of `freetoken-primary`
  is read
- **THEN** every value equals `freetoken-local/active`

#### Scenario: Retired clone primaries are gone

- **GIVEN** the parsed `agent` object of `.opencode/agent-models.jsonc`
- **WHEN** the keys are inspected for `gemma26-primary`, `gemma26-vision`,
  `gptoss-primary`, `devstral-primary`, `gemma12-primary`,
  `gemma26-throughput-primary`, or `qwen38-primary` with `mode: "primary"`
- **THEN** none of them exists

## ADDED Requirements

### Requirement: Project Default Model Targets the FreeToken Alias

The project opencode config `.opencode/opencode.jsonc` SHALL declare
`freetoken-local/active` as its top-level default `model`. It SHALL NOT declare
a default that resolves to the retired llama.cpp proxy stack
(`llamacpp-local/*`).

Rationale: the GPU-chat loadouts of the llm-proxy are decommissioned
(`enabled: false` across `scripts/llm/loadouts.json`, proxy :18235 down); a
project session starting on `llamacpp-local/qwen38-220k` boots against a dead
backend (T016419). The global config already carries no default, making the
project value the effective one for repo sessions.

#### Scenario: Default model resolves to the resident FreeToken checkpoint

- **GIVEN** `.opencode/opencode.jsonc` declares its top-level `model`
- **WHEN** the value is read
- **THEN** it equals `freetoken-local/active`

### Requirement: Dead Checkpoints Are Not Declared

The provider catalogs in `.opencode/agent-models.jsonc` SHALL NOT declare
model entries whose weights no longer exist on disk (`gptoss-context`,
`gemma26-factory`, `gemma4`, `gemma26-throughput`). Entries whose GGUF files
remain present (`hauhau-qwen36`, `gemma12-vision`, `qwen38-220k`) MAY stay as
the documented fallback layer even while their loadouts are disabled.

Rationale: every catalog entry promises measured context limits; an entry
without weights cannot honor them and dispatches into the void (T002633-class,
recurring). The dense NVFP4 checkpoint Qwen3.6-27B-NVFP4 was deleted by operator
decision — dense models do not fit the VRAM budget, so only the three MoE FTW
checkpoints remain viable under FreeToken (T016419).

#### Scenario: Catalog entries have weights on disk

- **GIVEN** the parsed `llamacpp-local.models` object of
  `.opencode/agent-models.jsonc`
- **WHEN** each entry's loadout model path from `scripts/llm/loadouts.json` is
  resolved against the filesystem
- **THEN** no declared entry points at a missing weight file
