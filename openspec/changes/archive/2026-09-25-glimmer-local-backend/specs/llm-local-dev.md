## RENAMED Requirements

### Requirement: Local Agent Roster on the Qwen3.8 Checkpoint

**Renamed-to:** Local Agent Roster on the Glimmer Checkpoint

### Requirement: Project Default Model Targets the Local Qwen3.8 Checkpoint

**Renamed-to:** Project Default Model Targets the Local Glimmer Checkpoint

## MODIFIED Requirements

### Requirement: Single Definition Site for the opencode `llamacpp-local` Provider

The opencode provider key `llamacpp-local` SHALL be defined in exactly one place
in the repository, namely `.opencode/agent-models.jsonc`. `.opencode/opencode.jsonc`
SHALL NOT define a provider under that key. The provider SHALL target the
local llama.cpp server directly at `http://127.0.0.1:1919/v1`. It SHALL NOT
target the retired llm-proxy on `:18235` (stopped 2026-09-03, ADR-007; T900208).

Rationale: mirrors the original `llamacpp-mtp` single-definition requirement —
`.opencode/agent-models.jsonc` is the sync source that
`scripts/opencode-sync-agents.sh` merges into the global config; a second
definition in the project config would silently override it (T002159, T014105).
The key keeps its historical name; since T900348 a llama.cpp server serves
`:1919` again, replacing FreeToken-native (T014028/T014105, T900203). Since
T900365 that server is `scripts/llm/glimmer.service`.

#### Scenario: Provider is declared once with the :1919 endpoint

- **GIVEN** `.opencode/agent-models.jsonc` defines the provider `llamacpp-local`
- **WHEN** the file is parsed and the provider's `options.baseURL` inspected
- **THEN** the value is `http://127.0.0.1:1919/v1` and not the retired `:18235` proxy port

### Requirement: Local Agent Roster on the Glimmer Checkpoint

The local agent roster in `.opencode/agent-models.jsonc` SHALL consist of
`local` and `reviewer` as `mode: "subagent"` and `glimmer-primary` as
`mode: "primary"`. Every one of them SHALL reference
`llamacpp-local/Muse-Glimmer-30B` as its model. The agent `qwen38-primary` and
its prompt `.opencode/prompts/qwen38-primary.md` SHALL NOT exist.

Rationale: the five legacy family handles (`gptoss`, `devstral`, `gemma`,
`gemma12`, `qwen38`) all pointed at the same FreeToken model and collapsed into a
single `local` subagent on 2026-09-16 (T900164). Clone primaries whose names
referenced retired loadouts were removed instead of kept as lying aliases
(T016419). T900365 replaced Qwen3.8-27B with Muse Glimmer 30B, which is
distilled from Muse Spark — the model family the `orchestrator` plans on. By the
same rule the primary is named after the model it runs: `glimmer-primary`.

#### Scenario: Agents reference the Glimmer model

- **GIVEN** the agent blocks in `.opencode/agent-models.jsonc`
- **WHEN** the `model` field of `local`, `reviewer` and `glimmer-primary` is read
- **THEN** every value equals `llamacpp-local/Muse-Glimmer-30B`

#### Scenario: The Qwen-named primary is gone

- **GIVEN** the parsed `agent` object of `.opencode/agent-models.jsonc`
- **WHEN** its keys are inspected
- **THEN** `glimmer-primary` exists with `mode: "primary"` and `qwen38-primary` does not exist

#### Scenario: Retired clone primaries are gone

- **GIVEN** the parsed `agent` object of `.opencode/agent-models.jsonc`
- **WHEN** the keys are inspected for `gemma26-primary`, `gemma26-vision`,
  `gptoss-primary`, `devstral-primary`, `gemma12-primary`,
  `gemma26-throughput-primary`, or `freetoken-primary` with `mode: "primary"`
- **THEN** none of them exists

### Requirement: Single Static Model, No Alias Layer

The `llamacpp-local` provider SHALL declare exactly one model entry,
`Muse-Glimmer-30B`. The `freetoken-active.ts` plugin, its
`active`/`active-thinking`/`active-fast` aliases and the
`freetoken-thinking`/`freetoken-fast-*` agents SHALL NOT exist.

Rationale: the alias layer and the dynamic thinking pool were removed together
with the plugin (T900203). llama.cpp serves one resident checkpoint with a fixed
131072-token KV (T900365); per-request reasoning levels travel in
`chat_template_kwargs`, and the engine is not swapped from the model picker.

#### Scenario: Catalog holds the single static model

- **GIVEN** the parsed `llamacpp-local.models` object of
  `.opencode/agent-models.jsonc` and the agent roster
- **WHEN** the model keys and the agent `model` fields are inspected
- **THEN** exactly `Muse-Glimmer-30B` is declared and no
  `active`/`active-thinking`/`active-fast` alias and no
  `freetoken-thinking`/`freetoken-fast-*` agent exists

### Requirement: Measured Context Limits for the Local Checkpoint

The `limit.context` value of the `Muse-Glimmer-30B` entry in the
`llamacpp-local` provider SHALL equal the served KV capacity: `131072`
(= served `n_ctx` in `/props`, set by `-c 131072` in
`scripts/llm/glimmer.service`, which is also the model's
`max_position_embeddings`). Every `llamacpp-local` `limit.context` SHALL be a
positive integer and SHALL NOT exceed `131072`.

Rationale: every catalog entry promises measured context limits; a number above
the served KV dispatches into a context overflow at runtime (T002633-class,
recurring). Glimmer's 39 sliding-window layers (window 2048) keep the q8_0 KV
for the full 131072 tokens at roughly 0.93 GB, so the RTX 5070 Ti holds target,
DFlash2 drafter and KV in 15.09 GB. A 117,097-token prompt was served with the
needle found (measured 2026-09-25, T900365).

#### Scenario: Declared context equals the served KV

- **GIVEN** the parsed `llamacpp-local.models` object of
  `.opencode/agent-models.jsonc` and `scripts/llm/glimmer.service`
- **WHEN** the `limit.context` of `Muse-Glimmer-30B` and the unit's `-c` value are read
- **THEN** both are `131072`

### Requirement: Project Default Model Targets the Local Glimmer Checkpoint

The project opencode config `.opencode/opencode.jsonc` SHALL declare
`llamacpp-local/Muse-Glimmer-30B` as its top-level default `model`. It SHALL NOT
declare a default that resolves to a model key absent from the `llamacpp-local`
catalog in `.opencode/agent-models.jsonc`, such as the retired
`llamacpp-local/Qwen3.8-27B-gsq`, `llamacpp-local/qwen38-220k` or
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4`.

Rationale: T900348 replaced FreeToken-native with llama.cpp serving Qwen3.8-27B
on `:1919`; T900359 moved it to GSQ-RCO IQ3_XXS-mtp on the RTX 5070 Ti alone.
T900365 replaced it with Muse Glimmer 30B UD-IQ3_XXS plus a DFlash2 drafter and
renamed the key to `Muse-Glimmer-30B`. A project default naming a key the catalog
no longer declares boots against an unknown model (T900350).

#### Scenario: Default model resolves to the Glimmer entry

- **GIVEN** `.opencode/opencode.jsonc` declares its top-level `model`
- **WHEN** the value is read
- **THEN** it equals `llamacpp-local/Muse-Glimmer-30B`

### Requirement: Dead Checkpoints Are Not Declared

The provider catalogs in `.opencode/agent-models.jsonc` SHALL NOT declare
model entries whose weights no longer serve on `:1919`. The `llamacpp-local`
catalog SHALL declare exactly `Muse-Glimmer-30B`; the retired keys
`Qwen3.8-27B-gsq`, `Qwen3.6-35B-A3B-NVFP4`, `qwen38-220k`, `gptoss-context`,
`gemma26-factory`, `gemma4`, `gemma26-throughput`, `gemma12-vision` and
`hauhau-qwen36` SHALL NOT be declared.

Rationale: every catalog entry promises measured context limits; an entry
without a serving backend cannot honor them and dispatches into the void
(T002633-class, recurring). The FreeToken consolidation left a single resident
checkpoint (T900203, T016419); T900348 and T900359 replaced it with Qwen3.8
checkpoints, and T900365 with Muse Glimmer 30B.

#### Scenario: Dead catalog keys are absent

- **GIVEN** the parsed `llamacpp-local.models` object of
  `.opencode/agent-models.jsonc`
- **WHEN** its keys are inspected
- **THEN** `Muse-Glimmer-30B` is declared and none of `Qwen3.8-27B-gsq`,
  `Qwen3.6-35B-A3B-NVFP4`, `qwen38-220k`, `gptoss-context`, `gemma26-factory`,
  `gemma4`, `gemma26-throughput`, `gemma12-vision`, `hauhau-qwen36` is declared

### Requirement: Compaction Scales With the Model Window

The project opencode config SHALL declare a `compaction` block with
`auto: true`, `keep.tokens: 16000` and `buffer: 33600`, with a comment showing
the threshold math for the default model. The default model's catalog entry
SHALL declare `limit.input` equal to its `limit.context`. `.opencode/dcp.jsonc` SHALL declare per-model
`modelMinLimits` and `modelMaxLimits` for the default model as percentages of
its `limit.context`, both SHALL resolve below that model's compaction
threshold, and it SHALL set `experimental.allowSubAgents: true`.

Rationale: opencode 1.18 maps the V2 keys onto its V1 settings
(`opencode debug config` shows `buffer` as `reserved` and `keep.tokens` as
`preserve_recent_tokens`). The prompt loop that serves TUI primaries and every
`task` subagent dispatch (`packages/opencode/src/session/overflow.ts`) computes
`input − reserved` when `limit.input` is set and `context − output` otherwise,
ignoring `reserved`. The `session.next` runtime
(`packages/core/src/session/compaction.ts`) computes
`context − max(output, buffer)`. With `context = input = 131072` and
`output: 8192`, both yield 97472 (T900365; 120000 on the former 153600-token
Qwen window). DCP resolves `"X%"` against the active model's `limit.context`
and prefers a `providerID/modelID` entry over the global value: `40%`/`70%`
give 52429/91750 on the local model — `75%` would resolve to 98304, above the
trigger, and never fire — while the global 85000/103000 keep the 1M cloud
models in the 60–100k working band (T900350). DCP skips sessions with a
`parentID` unless `experimental.allowSubAgents` is true, so without it
subagents received neither nudge nor forced pruning.

#### Scenario: Compaction block present

- **GIVEN** `.opencode/opencode.jsonc`
- **WHEN** the `compaction` block is inspected
- **THEN** it contains `auto: true`, `keep.tokens: 16000` and `buffer: 33600`

#### Scenario: Threshold math holds for the default model on both paths

- **GIVEN** the default model limit `context: 131072`, `input: 131072`,
  `output: 8192`
- **WHEN** `input − buffer` (prompt loop) and `context − max(output, buffer)`
  (`session.next`) are computed
- **THEN** both results are `97472`

#### Scenario: DCP limits sit below the local compaction trigger

- **GIVEN** `.opencode/dcp.jsonc` and the default model's catalog limits
- **WHEN** its `modelMinLimits` and `modelMaxLimits` entries are resolved
- **THEN** they equal 52429 and 91750, and 91750 is below 97472

#### Scenario: DCP runs in subagent sessions

- **GIVEN** `.opencode/dcp.jsonc`
- **WHEN** its `experimental` block is inspected
- **THEN** `allowSubAgents` is `true`

## ADDED Requirements

### Requirement: Glimmer Serving Profile on :1919

`scripts/llm/glimmer.service` SHALL be the only systemd user unit that serves
`:1919`, and `scripts/llm/qwen38-gsq.service` SHALL NOT exist. Its
`llama-server` command line SHALL load `Muse-Glimmer-30B-UD-IQ3_XXS.gguf` as the
target and `Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf` as the draft model with
`--spec-type draft-dflash` and `--spec-draft-n-max 4`, pin both to the RTX 5070 Ti
by UUID through `CUDA_VISIBLE_DEVICES`, and set `-c 131072`, `-ctk q8_0`,
`-ctv q8_0`, `-np 1`, `--jinja`, `--alias Muse-Glimmer-30B`, `--temp 1.0`,
`--top-p 0.95`, `--top-k 64`, `--host 0.0.0.0` and `--port 1919`. It SHALL NOT
set `--mmproj` and SHALL NOT place the draft model on another device than the
target.

Rationale: the DFlash2 drafter shares the target's `output.weight`; with
`-devd CUDA1` llama.cpp aborts while reserving the graph ("pre-allocated tensor
(output.weight) in a buffer (CUDA0) that cannot run the operation"). Measured
2026-09-25 on llama.cpp `e85e15cf6` (DFlash2 support landed with #27816):
`n_max 4` decodes ~79 tok/s short and 84–89 tok/s at 117k context against 36
tok/s without the drafter, and beats the model card's `n_max 15` (53 tok/s at
117k), whose long drafts are mostly rejected. `q8_0` KV costs 0.45 GB over
`q4_0` thanks to the sliding-window layers and keeps tool-call arguments intact
(see `gemma-kv-quant.bats`). The vision projector is left out by operator
decision; at 15.09 GB there is no room for it either.

#### Scenario: Unit carries the measured Glimmer profile

- **GIVEN** `scripts/llm/glimmer.service`
- **WHEN** its `ExecStart` command line is read
- **THEN** it contains `--spec-type draft-dflash`, `--spec-draft-n-max 4`, `-c 131072`, `-ctk q8_0`, `-ctv q8_0`, `--alias Muse-Glimmer-30B` and `--port 1919`, and contains neither `--mmproj` nor `-devd CUDA1`

#### Scenario: The Qwen unit is retired

- **GIVEN** the `scripts/llm/` directory
- **WHEN** its unit files are listed
- **THEN** `glimmer.service` exists and `qwen38-gsq.service` does not

### Requirement: Reasoning-Off Requests Also Lower Glimmer's Reasoning Strength

Every repository caller that sends `chat_template_kwargs.enable_thinking: false`
to the local server SHALL send `chat_template_kwargs.reasoning_strength: "low"`
in the same object. Callers that gate these kwargs on the model name SHALL treat
a model id containing `glimmer` like one containing `qwen`.

Rationale: Glimmer's embedded chat template ignores `enable_thinking` and writes
`Reasoning strength: <level>.` into the system header, defaulting to `high`;
there is no "off" level. A caller that only disables thinking would silently get
full reasoning and, with a tight `max_tokens`, an empty `content` — the failure
mode of T002533. Keeping both keys lets the same payload work for Gemma and Qwen
templates, which ignore `reasoning_strength`.

#### Scenario: Payload builders carry both keys

- **GIVEN** the payload built by `scripts/plan-qa-check.sh` with reasoning disabled
- **WHEN** its `chat_template_kwargs` object is inspected
- **THEN** it contains `enable_thinking: false` and `reasoning_strength: "low"`

#### Scenario: Model-gated callers recognise Glimmer

- **GIVEN** `scripts/factory/mcp-go/main.go` building a request for model `Muse-Glimmer-30B`
- **WHEN** the request body is marshalled
- **THEN** `chat_template_kwargs.reasoning_strength` is `low`
