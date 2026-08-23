## ADDED Requirements

### Requirement: Single Definition Site for the opencode `freetoken-local` Provider

The opencode provider key `freetoken-local` SHALL be defined in exactly one place
in the repository, namely `.opencode/agent-models.jsonc`. `.opencode/opencode.jsonc`
SHALL NOT define a provider under that key. The provider SHALL target the
FreeToken-native engine at `http://127.0.0.1:1919/v1`.

Rationale: mirrors the existing `llamacpp-mtp` single-definition requirement —
`.opencode/agent-models.jsonc` is the sync source that
`scripts/opencode-sync-agents.sh` merges into the global config; a second
definition in the project config would silently override it (T002159, T014105).

#### Scenario: Provider is declared once with the FreeToken endpoint

- **GIVEN** `.opencode/agent-models.jsonc` defines the provider `freetoken-local`
- **WHEN** the file is parsed and the provider's `options.baseURL` inspected
- **THEN** the value is `http://127.0.0.1:1919/v1`

### Requirement: Model-Agnostic Active Alias for FreeToken-Native Agents

The `freetoken-local` provider SHALL declare an alias model entry `active`
alongside the concrete checkpoint entries. Every local-family subagent
(`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`) and every local primary
agent (`gemma26-primary`, `gemma26-vision`, `gptoss-primary`,
`devstral-primary`, `gemma12-primary`, `gemma26-throughput-primary`,
`qwen38-primary`, `freetoken-primary`) SHALL reference
`freetoken-local/active` as its model.

Rationale: FreeToken serves one resident model at a time on a shared port and
ignores the `model` field of incoming requests (verified live 2026-08-23), so a
stable alias always reaches whichever checkpoint is resident — per-model agent
wiring would break on every `/engine/switch` (T014105).

#### Scenario: Agents reference the alias

- **GIVEN** the agent blocks in `.opencode/agent-models.jsonc`
- **WHEN** the `model` field of each listed local agent is read
- **THEN** every value equals `freetoken-local/active`

### Requirement: Measured Context Limits for FreeToken Checkpoints

The `limit.context` values in the `freetoken-local` provider SHALL equal the
measured usable KV capacity, not the advertised `max_model_len`: `131072` for
`Qwen3.6-35B-A3B-NVFP4`, `65536` for `gpt-oss-20b`, and `32768` for
`Gemma-4-26B-A4B-NVFP4`. A plugin `freetoken-active.ts` SHALL set the alias
entry's limit at opencode startup from the daemon's resident-model report and
SHALL fail silent when the daemon is unreachable.

Rationale: the server advertises `max_model_len=262144` while the calibrated
serve configuration pins usable KV pages far below it; opencode auto-compacts
at 95 % of the declared limit, so declaring the advertised number reproduces
the dropped-request failure class (`Input sequence length exceeds`) the
calibration removed (T014105).

#### Scenario: Declared limits match the measured KV capacity

- **GIVEN** the parsed `freetoken-local.models` object
- **WHEN** each concrete checkpoint entry's `limit.context` is compared against
  the measured values
- **THEN** Qwen3.6-35B-A3B-NVFP4 declares 131072, gpt-oss-20b declares 65536,
  and Gemma-4-26B-A4B-NVFP4 declares 32768

#### Scenario: Plugin resolves the alias limit from the daemon

- **GIVEN** the FreeToken daemon answers `GET http://127.0.0.1:1900/engine/status`
  with the resident model path
- **WHEN** opencode starts and the plugin's config hook runs
- **THEN** the alias entry carries the resident checkpoint's measured limit,
  and with the daemon unreachable the static fallback remains unchanged

### Requirement: Sync Distributes opencode Plugins

`scripts/opencode-sync-agents.sh` SHALL copy plugin files from
`.opencode/plugin/` into the global opencode plugin directory next to the
global config, in addition to the existing prompt distribution.

Rationale: the global config references the plugin by path relative to the
global config directory; without distribution the repo-hosted plugin never
reaches the loading location and the alias keeps its static fallback limit
(T014105).

#### Scenario: Sync copies plugin files

- **GIVEN** `.opencode/plugin/freetoken-active.ts` exists in the repository
- **WHEN** `scripts/opencode-sync-agents.sh` runs
- **THEN** the file exists under the global opencode plugin directory afterwards
