## MODIFIED Requirements

### Requirement: Single Definition Site for the opencode `llamacpp-local` Provider

The opencode provider key `llamacpp-local` SHALL be defined in exactly one place
in the repository, namely `.opencode/agent-models.jsonc`. `.opencode/opencode.jsonc`
SHALL NOT define a provider under that key. The provider SHALL target the
FreeToken-native engine directly at `http://127.0.0.1:1919/v1`. It SHALL NOT
target the retired llm-proxy on `:18235` (stopped 2026-09-03, ADR-007; T900208).

Rationale: mirrors the original `llamacpp-mtp` single-definition requirement —
`.opencode/agent-models.jsonc` is the sync source that
`scripts/opencode-sync-agents.sh` merges into the global config; a second
definition in the project config would silently override it (T002159, T014105).
The key keeps its historical name although no llama.cpp loadout is active behind
it anymore (T014028/T014105, consolidated 2026-09-16, T900203).

#### Scenario: Provider is declared once with the FreeToken endpoint

- **GIVEN** `.opencode/agent-models.jsonc` defines the provider `llamacpp-local`
- **WHEN** the file is parsed and the provider's `options.baseURL` inspected
- **THEN** the value is `http://127.0.0.1:1919/v1` and not the retired `:18235` proxy port

### Requirement: Local Agent Roster on the Qwen3.6 Checkpoint

The local agent roster in `.opencode/agent-models.jsonc` SHALL consist of
`local` and `reviewer` as `mode: "subagent"` and `qwen38-primary` as
`mode: "primary"`. Every one of them SHALL reference
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4` as its model.

Rationale: the five legacy family handles (`gptoss`, `devstral`, `gemma`,
`gemma12`, `qwen38`) all pointed at the same FreeToken model — five names, one
slot, no prefix-cache gain. They collapsed into a single `local` subagent on
2026-09-16 (T900164). The `freetoken-local` provider and its `active` alias are
gone; the provider key is `llamacpp-local` (historical name) serving FreeToken
directly on `:1919` (T900203; the llm-proxy hop was dropped in T900208). The former per-loadout primaries
(`gemma26-primary`, `gemma26-vision`, `gptoss-primary`, `devstral-primary`,
`gemma12-primary`, `gemma26-throughput-primary`, `qwen38-primary`) were
byte-identical clones whose names referenced retired loadouts; they are removed
instead of kept as lying aliases (T016419). `qwen38-primary` keeps its
historical name although it now runs the Qwen3.6 checkpoint.

#### Scenario: Agents reference the Qwen3.6 model

- **GIVEN** the agent blocks in `.opencode/agent-models.jsonc`
- **WHEN** the `model` field of `local`, `reviewer` and `qwen38-primary` is read
- **THEN** every value equals `llamacpp-local/Qwen3.6-35B-A3B-NVFP4`

#### Scenario: Retired clone primaries are gone

- **GIVEN** the parsed `agent` object of `.opencode/agent-models.jsonc`
- **WHEN** the keys are inspected for `gemma26-primary`, `gemma26-vision`,
  `gptoss-primary`, `devstral-primary`, `gemma12-primary`,
  `gemma26-throughput-primary`, or `freetoken-primary` with `mode: "primary"`
- **THEN** none of them exists

### Requirement: Project Default Model Targets the FreeToken Alias

The project opencode config `.opencode/opencode.jsonc` SHALL declare
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4` as its top-level default `model`. It SHALL NOT declare a
default that resolves to the retired llama.cpp loadout `llamacpp-local/qwen38-220k`
(port 8094, no longer served).

Rationale: FreeToken (Windows-native, port 1919) was re-established as the local inference
backend by operator decision (T900189), served directly on `:1919` since the llm-proxy (`:18235`) was retired (T900208).
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4` (200000 served KV, moe 4150) is the active model alias
that resolves to that backend and is declared in `.opencode/agent-models.jsonc` for every
re-routed agent. A project default naming the retired llama.cpp loadout boots against a dead
backend.

#### Scenario: Default model resolves to the Qwen3.6-35B-A3B-NVFP4 alias

- **GIVEN** `.opencode/opencode.jsonc` declares its top-level `model`
- **WHEN** the value is read
- **THEN** it equals `llamacpp-local/Qwen3.6-35B-A3B-NVFP4`

### Requirement: FreeToken Plugin Layer Removed

The `freetoken-active.ts` plugin SHALL NOT exist — neither in the repository
(`.opencode/plugin/`) nor in the global opencode plugin directory. Its alias
telemetry, engine auto-swap, engine stop, degraded failure path, fetch-wrapper
consistency guard and the BATS coverage for auto-swap SHALL NOT be re-added
without a new requirement.

Rationale: the plugin was removed together with the alias layer (T900203).
FreeToken serves one resident checkpoint on a static 200k KV pool; there is no
per-request thinking toggle, no engine switching from the model picker, and no
telemetry file. The provider is wired statically to FreeToken on `:1919` (T900208).

#### Scenario: Plugin file is absent

- **GIVEN** the repository directory `.opencode/plugin/`
- **WHEN** its entries are listed
- **THEN** `freetoken-active.ts` is not among them

### Requirement: A local agent MAY use llama.cpp or FreeToken, but never a dead loadout

Since T014028 the llama loadouts were switched off wholesale and every guard forbade any
`llamacpp-local/*` reference. That ban was too coarse: it addressed a real failure — an agent
pointing at a loadout that is not running — but also forbade the working case.

A local agent MUST resolve to one of exactly two backends: the `llamacpp-local` provider
(FreeToken directly on `:1919`, historical key name), or a llama.cpp loadout that is
**enabled** in `scripts/llm/loadouts.json`. A reference to a loadout that is absent or
`enabled: false` MUST fail the build. The backend name itself carries no verdict —
liveness does.

At least one local primary MUST run on `llamacpp-local`. It is the backend without a GPU
precondition and therefore the fallback when a llama loadout cannot load.

The two backends are **alternatives, not concurrent**: FreeToken occupies roughly 15.7 of 16 GB
of VRAM exclusively. Nothing in this spec implies they may run side by side.

The Factory fallback (`scripts/factory/route-provider.sh`) and the project default MUST remain
FreeToken. Widening the agent side does not widen the default.

#### Scenario: An agent points at a disabled loadout

- **GIVEN** `agent-models.jsonc` references `llamacpp-local/<slug>`
- **AND** that loadout is `enabled: false` in `loadouts.json`, or absent entirely
- **WHEN** the guard runs
- **THEN** it fails and names the slug
