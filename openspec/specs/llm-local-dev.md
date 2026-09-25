# llm-local-dev

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das `llm-local-dev`-Domain beschreibt die lokale LLM-Entwicklungsumgebung auf Basis von OpenClaw/Opencode, das direkt gegen eine lokale Ollama-Instanz arbeitet. Die Konfiguration wird über `Taskfile.openclaw.yml` und `openclaw/.env` verwaltet und ist so gestaltet, dass keine API-Keys oder Modell-Endpunkte versehentlich ins Repository gelangen. Alle Tasks (install, configure, start, status, logs, backup, restore, wipe) sind im dedizierten Taskfile deklariert und vom Root-Taskfile eingebunden.

---

## Requirements

### Requirement: Single Definition Site for the opencode `llamacpp-mtp` Provider

The opencode provider key `llamacpp-mtp` SHALL be defined in exactly one place in
the repository, namely `.opencode/agent-models.jsonc`. `.opencode/opencode.jsonc`
SHALL NOT define a provider under that key.

Rationale: `.opencode/agent-models.jsonc` is the sync source that
`scripts/opencode-sync-agents.sh` (wired as `Taskfile.yml:223`) merges into
`~/.config/opencode/opencode.jsonc`. Because opencode layers the project config on
top of the global one, a second definition in `.opencode/opencode.jsonc` silently
overrides the synced value inside this repository, and the sync pipeline cannot
correct it — it only ever writes the global file (T002159).

#### Scenario: Projekt-Config definiert den Provider nicht erneut

- **GIVEN** `.opencode/agent-models.jsonc` definiert den Provider `llamacpp-mtp`
  mit `baseURL` `http://127.0.0.1:8091/v1`
- **WHEN** `.opencode/opencode.jsonc` auf eine erneute Definition desselben
  Provider-Keys geprüft wird
- **THEN** enthält die Datei keinen `llamacpp-mtp`-Eintrag, sodass der aus
  `agent-models.jsonc` gesyncte Wert im Projekt-Kontext wirksam bleibt

#### Scenario: Kein opencode-Provider zeigt auf den Bonsai-Port

- **GIVEN** Port `8093` ist gemäß
  `.claude/skills/llama-cpp/references/bonsai-server-windows.md` fest dem
  Ternary-Bonsai-Server zugewiesen und `llama-server` validiert das `model`-Feld
  einer Anfrage nicht, antwortet also unabhängig vom angefragten Modellnamen mit
  dem geladenen Modell
- **WHEN** die JSONC-Dateien unter `.opencode/` auf `baseURL`-Werte mit Port `8093`
  geprüft werden
- **THEN** existiert kein solcher `baseURL`-Eintrag, sodass ein laufender
  Bonsai-Server keine Antworten unter dem Label eines Gemma-Modells liefern kann

### Requirement: Declared Context Window Matches the Running Gemma Server

The `limit.context` declared for the model `gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` in
`.opencode/agent-models.jsonc` SHALL match the context window the llama.cpp server
actually exposes, as reported by `GET /props` → `default_generation_settings.n_ctx`.

Rationale: the previous value of `4096` derived from a retired `-np 4` slot layout
(16384 total context divided across four slots). The current start script
`start-gemma4-12b-mtp.ps1` sets no `-np`, so a single slot owns the full `-c 16384`
context; declaring `4096` made opencode discard three quarters of the available
window (T002159).

#### Scenario: Deklariertes Kontextfenster entspricht dem Server-Wert

- **GIVEN** das Startskript startet `llama-server` mit `-c 16384` und ohne `-np`
- **WHEN** `.opencode/agent-models.jsonc` auf den `limit.context`-Wert des
  Gemma-Modelleintrags geprüft wird
- **THEN** ist der Wert `16384` und stimmt damit mit dem vom Server unter
  `/props` gemeldeten `n_ctx` überein

### Requirement: Dynamic Coaching Model Discovery

The system SHALL offer the LM Studio models installed on the configured coaching
LLM endpoint as autocomplete suggestions for the coaching provider `modelName`
field, while always allowing free-text entry. A pure helper `fetchModelIds(baseUrl,
timeoutMs?)` SHALL perform a GET on `<baseUrl>/models`, parse the OpenAI response
shape `data[].id`, and return `{ reachable: boolean; models: string[] }`; any
network, timeout, or parse error SHALL yield `{ reachable: false, models: [] }`.
A new endpoint `GET /api/admin/coaching/ki-config/models?id=<configId>` SHALL
resolve the config's base URL via the shared endpoint resolver and return that
helper result. The endpoint SHALL require admin authentication and SHALL NOT
respond with a 5xx status for an unreachable or misconfigured endpoint.

#### Scenario: Reachable endpoint returns installed model ids
- **GIVEN** an admin session and a coaching KI config whose endpoint exposes an OpenAI-compatible `/models` route returning `{ data: [{ id: "qwen2.5-7b" }, { id: "mistral-7b" }] }`
- **WHEN** the admin requests `GET /api/admin/coaching/ki-config/models?id=<configId>`
- **THEN** the response is HTTP 200 with body `{ reachable: true, models: ["qwen2.5-7b", "mistral-7b"] }`

#### Scenario: Unreachable endpoint degrades to free text without a 5xx
- **GIVEN** an admin session and a coaching KI config whose endpoint refuses the connection or exceeds the ~2s timeout
- **WHEN** the admin requests the models endpoint
- **THEN** the response is HTTP 200 with body `{ reachable: false, models: [] }` and the model input remains editable as free text

#### Scenario: Non-admin caller is rejected
- **GIVEN** a request without a valid admin session
- **WHEN** the models endpoint is called
- **THEN** the response is HTTP 401 (no session) or HTTP 403 (non-admin) and no endpoint probe is performed

### Requirement: Coaching Provider Activation Allowlist Reflects Catalog

The system SHALL derive the allowlist for activating a coaching KI provider from
the catalog of known interfaces plus the `custom_` prefix, rather than a
hardcoded subset. Activating any catalog provider id (including `local-lmstudio`)
or any `custom_*` provider SHALL be permitted; an unknown provider id SHALL be
rejected.

#### Scenario: A local LM Studio provider can be activated
- **GIVEN** an admin session and a coaching provider row with provider id `local-lmstudio`
- **WHEN** the admin issues `PATCH /api/admin/coaching/ki-config/active` with `{ "provider": "local-lmstudio" }`
- **THEN** the request is accepted (not rejected as an invalid provider) and the provider is set active

#### Scenario: An unknown provider id is rejected
- **GIVEN** an admin session
- **WHEN** the admin issues the activation request with `{ "provider": "not-a-provider" }`
- **THEN** the response is HTTP 400 with an `Invalid provider` error and no activation occurs

### Requirement: Client PII Scrubbed Before LLM Dispatch

The system SHALL remove client personally identifiable information from the
coaching step prompts immediately before dispatching them to the session agent.
A pure helper `scrubClientPii(text, { names, emails?, replacement })` SHALL
replace, case-insensitively and on word boundaries (Unicode/Umlaut-safe), full
client names, individual name components of at least three characters, and
e-mail addresses with the supplied replacement, without matching substrings
inside longer words. In the step generation route, the scrubber SHALL be applied
to both the effective system prompt and the assembled user prompt, using name
sources from the coaching session's client name and the linked customer record,
with the replacement being the customer number or `[KLIENT]`. A scrubber failure
SHALL be logged and SHALL NOT crash the generation.

#### Scenario: A typed client name never reaches the agent call
- **GIVEN** a coaching step whose coach free-text contains the client's full name and the session is linked to a customer with number `K-100`
- **WHEN** the step generation route assembles the system and user prompts
- **THEN** the prompts passed to the session agent contain `K-100` in place of the name and no longer contain the client name

#### Scenario: Word boundaries prevent false positives
- **GIVEN** a client name component `Hannes` and prompt text containing the unrelated word `Beispielhannes`
- **WHEN** the scrubber runs
- **THEN** `Beispielhannes` is left unchanged while a standalone `Hannes` token would be replaced

#### Scenario: Empty name list is an identity transform
- **GIVEN** a scrub call with an empty `names` array and no `emails`
- **WHEN** the scrubber runs on any text
- **THEN** the text is returned unchanged

### Requirement: Start scripts free their listen port before launching

Every start script under `scripts/llm/start-*.ps1` SHALL terminate any process
already listening on its target port before launching a new `llama-server`
instance. Without this, the new process fails silently at bind while the old one
keeps holding its model in VRAM — measured at roughly 1.8 GB per invocation on a
16 GB card shared by three models, accumulating with every further run.

The port SHALL be exposed as an `[int]$Port` script parameter defaulting to the
service's established port, so the cleanup block and the `--port` argument refer
to a single value rather than a repeated literal.

#### Scenario: Restarting a running server leaves exactly one process
- **GIVEN** a `llama-server` is listening on the script's port
- **WHEN** the start script is invoked again
- **THEN** the previously listening process is terminated, exactly one
  `llama-server` remains on that port, and it answers functional requests — not
  merely `/health`

#### Scenario: Starting on a free port needs no special case
- **GIVEN** no process is listening on the script's port
- **WHEN** the start script is invoked
- **THEN** the cleanup block matches nothing and the server starts normally

#### Scenario: Guard covers start scripts added later
- **GIVEN** a new `scripts/llm/start-*.ps1` is added without a port cleanup block
- **WHEN** the BATS suite `tests/spec/llm-pipeline.bats` runs
- **THEN** the directory-wide guard fails and names the offending file

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

### Requirement: Sync Distributes opencode Plugins

`scripts/opencode-sync-agents.sh` SHALL copy plugin files from
`.opencode/plugin/` into the global opencode plugin directory next to the
global config, in addition to the existing prompt distribution.

Rationale: the global config references the plugin by path relative to the
global config directory; without distribution the repo-hosted plugin never
reaches the loading location and the alias keeps its static fallback limit
(T014105).

#### Scenario: Sync copies plugin files

- **GIVEN** `.opencode/plugin/bge-mcp-env.ts` exists in the repository
- **WHEN** `scripts/opencode-sync-agents.sh` runs
- **THEN** the file exists under the global opencode plugin directory afterwards

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

### Requirement: FreeToken Plugin Layer Removed

The `freetoken-active.ts` plugin SHALL NOT exist — neither in the repository
(`.opencode/plugin/`) nor in the global opencode plugin directory. Its alias
telemetry, engine auto-swap, engine stop, degraded failure path, fetch-wrapper
consistency guard and the BATS coverage for auto-swap SHALL NOT be re-added
without a new requirement.

Rationale: the plugin was removed together with the alias layer (T900203).
The local server holds one resident checkpoint with a fixed KV; there is no
per-request thinking toggle, no engine switching from the model picker, and no
telemetry file. The provider is wired statically to `:1919` (T900208, T900348).

#### Scenario: Plugin file is absent

- **GIVEN** the repository directory `.opencode/plugin/`
- **WHEN** its entries are listed
- **THEN** `freetoken-active.ts` is not among them

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

### Requirement: Factory Roles Carry Minimal Toolsets

Each factory role (planner, implementer, reviewer, dispatcher) SHALL be
documented with only the tools it needs; the implementation SHALL restrict
per-agent permissions where opencode supports it and otherwise reduce the
global surface (disabled MCP servers, skill denies) plus a prompt convention.

- Planner: code search, read, ticket operations.
- Implementer: read, edit, shell, tests.
- Reviewer: read, diff, tests; no write access.
- Dispatcher: ticket/session operations, no code tools.

#### Scenario: Reviewer has no write access

- **GIVEN** the reviewer role definition
- **WHEN** its permission set is inspected
- **THEN** write/edit operations are denied

### Requirement: Fresh Sessions at Ticket and Partial Boundaries

The orchestrator and factory prompts SHALL require a fresh implementation
session per ticket/partial with a self-contained task packet (goal, files,
acceptance, `Done when`, `Stop when`, `Rejected approaches`); continuity
travels via Git, tickets, specs and handoff artifacts, not via long-running
conversations. Research and implementation SHALL be separate sessions.

#### Scenario: Task packet carries stopping conditions

- **GIVEN** a factory dispatch prompt
- **WHEN** its sections are inspected
- **THEN** it states `Done when` (behavior, tests, no unrelated files,
  commit, ticket evidence) and `Stop when` (3rd identical failure, missing
  credential, spec conflict, file-boundary breach)

### Requirement: Global Instructions Stay Lean

`AGENTS.md` SHALL NOT exceed 160 lines; guidance applying to fewer than ~20%
of factory tasks lives next to its component, not in the global prompt.

#### Scenario: AGENTS.md line cap

- **GIVEN** `AGENTS.md` on the feature branch
- **WHEN** `wc -l` is run
- **THEN** the count is at most 160

### Requirement: Start scripts leave -ngl to -fit

A start script under `scripts/llm/start-*.ps1` that launches `llama-server` with
`-fit on` SHALL NOT pass `-ngl` in its unconditional argument list. llama.cpp
aborts the layer placement step of parameter fitting as soon as `n_gpu_layers`
is set by the user; the context is still reduced towards the `-fitt` margins,
but the layers are spread in proportion to free VRAM instead of being placed
against the margins. The script MAY pass `-ngl` on a path that disables fitting
(`-fit off` with a fixed `-c`).

A start script MAY pass an explicit `-ts` split together with `-fit on` when the
split is measured and documented. `-ts` aborts layer placement the same way,
which makes the placement deterministic, while context fitting against `-fitt`
continues. The Qwen 27B dual-GPU loadout SHALL use `-ts 85,15` in both
`scripts/llm/start-qwen-server.ps1` and the `qwen38-220k` loadout.

Rationale: measured 2026-09-15 on the Qwen 27B dual-GPU loadout. With
`-ngl 999 -fit on -fitt 256,1500` the display GPU kept about 250 MiB free.
Without `-ngl` it kept 1752 MiB at 205,056 context and decoded at 31 tok/s,
leaving 2782 MiB unused on the RTX 5070 Ti. With `-ts 85,15` it kept 2628 MiB
at the same context and decoded at 38 tok/s.

#### Scenario: Measured split favours the faster GPU

- **GIVEN** `start-qwen-server.ps1` runs without `-Ctx` and without `-SingleGpu`
- **WHEN** `llama-server` loads the model
- **THEN** the argument list contains `-ts 85,15` and the secondary GPU keeps at least its configured margin free

#### Scenario: Script and loadout agree on the split

- **GIVEN** the `qwen38-220k` loadout in `scripts/llm/loadouts.json`
- **WHEN** `tests/spec/llm-local-dev/qwen-tensor-split.bats` runs
- **THEN** its `-ts` value equals the `-TensorSplit` default of `start-qwen-server.ps1`

#### Scenario: Fixed context keeps full offload

- **GIVEN** `start-qwen-server.ps1` runs with `-Ctx 65536`
- **WHEN** the argument list is built
- **THEN** it contains `-c 65536 -fit off -ngl 999`

#### Scenario: Guard covers start scripts added later

- **GIVEN** a `scripts/llm/start-*.ps1` passes `-fit on` and lists `-ngl` in its unconditional `$Params` block
- **WHEN** `tests/spec/llm-local-dev/fit-ngl-conflict.bats` runs
- **THEN** the guard fails and names the offending file

### Requirement: Single System Message for the FreeToken Provider

Requests that opencode sends through the `llamacpp-local` provider SHALL carry at
most one `role: "system"` message, and it SHALL be the first message. The plugin
`.opencode/plugin/system-message-merge.ts` SHALL wrap
`provider["llamacpp-local"].options.fetch` and merge every `system` message of a
chat request, in original order and joined by a blank line, into one message at
position 0. All other messages SHALL keep their relative order. Array content
SHALL be flattened to text. Requests of other providers, non-JSON bodies and
requests that already satisfy the rule SHALL pass through unchanged.

Rationale: the FreeToken Qwen3.6 chat template rejects every additional system
message with "could not encode request: System message must be at the
beginning." opencode 1.18.31 sends `system,system,user` for `qwen38-primary` and
the title agent. The llm-proxy fixup (retired T900208/T900213) and the
`freetoken-active.ts` merge (removed T900203) used to absorb this (T900220).

#### Scenario: Two leading system messages are merged

- **GIVEN** the plugin's `config` hook has wrapped the `llamacpp-local` fetch
- **WHEN** a request with messages `system(A), system(B), user` is sent
- **THEN** the upstream fetch receives `system("A\n\nB"), user`

#### Scenario: A later system message moves to the front

- **GIVEN** the wrapped `llamacpp-local` fetch
- **WHEN** a request with messages `system(A), user, assistant, system(B), user` is sent
- **THEN** the upstream fetch receives `system("A\n\nB"), user, assistant, user`

#### Scenario: Other providers are untouched

- **GIVEN** the plugin's `config` hook ran on a config without `llamacpp-local`
- **WHEN** a request with two system messages is sent through another provider
- **THEN** the upstream fetch receives the messages unchanged

### Requirement: Windows-Native FreeToken Auto-Start and Install Scripts

The system SHALL provide PowerShell management scripts under `scripts/llm/` for Windows-native FreeToken installation (`install-freetoken.ps1`) and logon auto-start (`freetoken-autostart.ps1`). The install script SHALL enforce Python 3.12, verify wheel existence in `%USERPROFILE%\Downloads\ft-wheels`, install PyTorch cu130 (`>=2.11,<2.12`), and verify CUDA GPU availability. The autostart script SHALL register a ScheduledTask (`FreeToken-Serve`) executing local binaries under `%LOCALAPPDATA%\FreeToken\bin` on Windows logon without depending on WSL paths.

#### Scenario: Install script checks Python version and CUDA GPU
- **GIVEN** `scripts/llm/install-freetoken.ps1` is invoked on Windows
- **WHEN** the script verifies the environment
- **THEN** it enforces Python 3.12 and asserts PyTorch sees CUDA GPU availability before finishing

#### Scenario: Autostart script registers logon scheduled task
- **GIVEN** `scripts/llm/freetoken-autostart.ps1` is invoked with `-Register`
- **WHEN** the task is created
- **THEN** it registers ScheduledTask `FreeToken-Serve` targeting `%LOCALAPPDATA%\FreeToken\bin\restart-freetoken.ps1` at logon

### Requirement: Local LLM Proxy FreeToken Thinking Fixup and Local Recognition

The local LLM proxy SHALL treat `kind='freetoken'` as a local backend in `scripts/llm-proxy/discovery.mjs`. The proxy SHALL apply the `freetoken-thinking` fixup in `scripts/llm-proxy/fixups.mjs` to set `chat_template_kwargs.enable_thinking = true` for model aliases ending with `-thinking` and `false` for model aliases ending with `-fast`.

#### Scenario: Proxy recognizes FreeToken as local backend
- **GIVEN** a request carrying `x-llm-local-only: 1`
- **WHEN** the backend selection evaluates a backend with `kind: 'freetoken'`
- **THEN** `isLocalBackend` returns `true` and the backend is eligible for selection

#### Scenario: Proxy sets enable_thinking for thinking and fast model aliases
- **GIVEN** a request with model alias `freetoken-local/active-thinking`
- **WHEN** `freetoken-thinking` fixup is applied
- **THEN** `chat_template_kwargs.enable_thinking` is set to `true`

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

### Requirement: Glimmer Worker MCP for Muse Code

The repository SHALL provide an MCP server `scripts/glimmer-worker-mcp/server.mjs` that lets Muse Code use
the local Glimmer model on `:1919` as a worker. It SHALL listen with Streamable HTTP on `127.0.0.1` (default
port `13007`, env `GLIMMER_WORKER_MCP_PORT`), SHALL reject requests without the bearer token from
`GLIMMER_WORKER_MCP_TOKEN` before reading the body, and SHALL use only the Node.js standard library plus
`scripts/lib/mcp-http-security.mjs`. It SHALL expose exactly the tools `glimmer_worker_start`,
`glimmer_worker_result` and `glimmer_worker_status`. A job SHALL run `opencode run --agent glimmer-primary
--dir <cwd> <task>`; jobs SHALL run one at a time in FIFO order with a per-job timeout. `glimmer_worker_start`
SHALL return a job id without waiting for the job, and `glimmer_worker_result` SHALL wait at most 55 seconds
per call and, once the job has ended, return its status, exit code, the tail of the opencode output, and the
target repository's `git status --porcelain` and `git diff --stat`.

Rationale: Muse Code's Meta provider cannot talk to llama-server — its stream decoder rejects llama-server's
Responses events (`reason="protocol"`) and llama-server drops Muse's `namespace` tools (measured 2026-09-25,
T900373). MCP is Muse's supported extension point. The asynchronous start/result split keeps every MCP call
short because Muse's MCP client timeout is undocumented, and the single-job queue mirrors the single slot of
`:1919` (`-np 1`).

#### Scenario: Unauthenticated requests are rejected

- **GIVEN** the server runs with a token
- **WHEN** a `tools/list` request arrives without a matching `Authorization: Bearer` header
- **THEN** the response status is 401 and no tool is invoked

#### Scenario: A job runs the worker and reports the diff

- **GIVEN** the server runs with `GLIMMER_WORKER_OPENCODE` pointing to an executable that edits a file
- **WHEN** `glimmer_worker_start` is called for a Git working tree and `glimmer_worker_result` is polled
- **THEN** the job ends with status `done`, and the result names the edited file in `git_status`

#### Scenario: Jobs outside a Git working tree are refused

- **GIVEN** a `cwd` that is not inside a Git working tree
- **WHEN** `glimmer_worker_start` is called
- **THEN** the call returns `isError: true` and no job is queued

### Requirement: Windows Paths Are Accepted by the Glimmer Worker

`glimmer_worker_start` SHALL accept `cwd` in WSL form and in Windows form. It SHALL map a drive path
`X:\a\b` to `/mnt/x/a/b` and a UNC path `\\wsl.localhost\<distro>\a\b` or `\\wsl$\<distro>\a\b` to `/a/b`
before validating it.

Rationale: the Windows installation of Muse Code reaches the same server over `127.0.0.1` (WSL mirrored
networking) and reports its working directory in Windows form.

#### Scenario: Windows forms resolve to WSL paths

- **GIVEN** the path mapper of the Glimmer worker
- **WHEN** it maps `C:\Users\x\repo`, `\\wsl.localhost\k3d-dev\home\x\repo` and `/home/x/repo`
- **THEN** the results are `/mnt/c/Users/x/repo`, `/home/x/repo` and `/home/x/repo`

### Requirement: The Glimmer Worker Is Registered Only in Muse Code

`scripts/glimmer-worker-mcp/install.sh` SHALL register the server as `mcpServers.glimmer-worker`
(`type: "http"`, URL `http://127.0.0.1:13007/mcp`, bearer header) in the Muse Code settings of WSL
(`~/.config/muse/settings.json`) and of Windows (`%USERPROFILE%\.config\muse\settings.json`), preserving all
other keys and writing a backup first. The server SHALL NOT be declared in
`docs/agent-guide/registry/mcp.yaml`.

Rationale: `task mcp:sync` distributes every registry entry to opencode, where the `glimmer-primary` worker
itself runs; a registry entry would let the worker delegate to itself recursively.

#### Scenario: Registration merges into existing settings

- **GIVEN** a Muse `settings.json` that already declares `mcpServers.factory-mcp-node`
- **WHEN** the installer registers the worker against that file
- **THEN** both `factory-mcp-node` and `glimmer-worker` are declared and a backup of the previous file exists

#### Scenario: The MCP registry does not list the worker

- **GIVEN** `docs/agent-guide/registry/mcp.yaml`
- **WHEN** its server ids are read
- **THEN** `glimmer-worker` is not among them

### Requirement: Image Generation MCP for Muse Code

The repository SHALL provide an MCP server `scripts/comfy-image-mcp/server.mjs` that lets Muse Code generate
images with the local ComfyUI instance. It SHALL listen with Streamable HTTP on `127.0.0.1` (default port
`13008`, env `COMFY_IMAGE_MCP_PORT`), SHALL reject requests without the bearer token from
`COMFY_IMAGE_MCP_TOKEN` before reading the body, and SHALL use only the Node.js standard library plus modules
under `scripts/lib/`. It SHALL expose exactly the tools `image_generate`, `image_result` and `image_status`.
`image_generate` SHALL return a job id without waiting for the image; jobs SHALL run one at a time in FIFO
order with a per-job timeout. `image_result` SHALL wait at most 55 seconds per call and, once the job has
ended, return its status, the written file path, the seed used, and the `git status --porcelain` of that file.
When no seed is given, the server SHALL choose one and report it.

Rationale: one image takes about two minutes on the RTX 3060 Ti (measured 111.64 s for 768x768 with 25 steps,
T900379), longer than an MCP call should block. The start/result split follows the Glimmer worker.

#### Scenario: Unauthenticated requests are rejected

- **GIVEN** the server runs with a token
- **WHEN** a `tools/list` request arrives without a matching `Authorization: Bearer` header
- **THEN** the response status is 401 and no tool is invoked

#### Scenario: A job writes the image into the working tree

- **GIVEN** the server runs against a ComfyUI endpoint that returns a PNG
- **WHEN** `image_generate` is called with an `out_path` inside a Git working tree and `image_result` is polled
- **THEN** the job ends with status `done`, the file exists at `out_path`, and the result reports a seed

### Requirement: Image Output Is Confined to Git Working Trees

`image_generate` SHALL accept `out_path` in WSL form and in Windows form, mapped with the same rules as the
Glimmer worker. It SHALL refuse the call without queueing a job when the parent directory of `out_path` does
not exist or is not inside a Git working tree, and when a file already exists at `out_path` unless
`overwrite` is `true`.

Rationale: every generated asset stays visible as a diff and can be reverted; an existing asset is never
replaced by accident.

#### Scenario: Output outside a Git working tree is refused

- **GIVEN** an `out_path` whose parent directory is not inside a Git working tree
- **WHEN** `image_generate` is called
- **THEN** the call returns `isError: true` and no job is queued

#### Scenario: An existing file is not overwritten by default

- **GIVEN** a file already exists at `out_path`
- **WHEN** `image_generate` is called without `overwrite: true`
- **THEN** the call returns `isError: true` and the file is unchanged

### Requirement: ComfyUI Runs Only While Images Are Requested

ComfyUI SHALL run as the systemd user unit `comfyui` that is not started at login. Before running a job the
server SHALL start the unit when ComfyUI does not answer on its endpoint, and SHALL fail the job when ComfyUI
does not become ready within the start timeout. When the queue has been empty for the idle period (default
15 minutes, env `COMFY_IMAGE_IDLE_MIN`), the server SHALL stop the unit.

Rationale: the model occupies the RTX 3060 Ti and the CPU-resident text encoder occupies about 10 GB RAM;
both should be free when no images are being made.

#### Scenario: The first job starts ComfyUI

- **GIVEN** ComfyUI is not running
- **WHEN** a job is queued
- **THEN** the server runs `systemctl --user start comfyui` before submitting the prompt

#### Scenario: An idle server stops ComfyUI

- **GIVEN** the last job has ended and no job is queued
- **WHEN** the idle period elapses
- **THEN** the server runs `systemctl --user stop comfyui`

### Requirement: Generated Images Can Be Cut Out and Pixelated

The server SHALL post-process an image with `scripts/comfy-image-mcp/postprocess.py` when `transparent` or
`pixelate` is requested, and SHALL keep the unprocessed image as `<name>.raw.png` next to `out_path`.
`transparent` SHALL remove the background and produce an RGBA image. `pixelate` SHALL downscale the longer side
to `size` pixels, reduce the opaque pixels to at most `colors` colours, optionally upscale by the integer
`scale` with nearest-neighbour sampling, and SHALL make the alpha channel binary when the image has one.

Rationale: game sprites need transparency, and pixel art needs a hard grid and a small palette, neither of
which the diffusion model produces by itself.

#### Scenario: Pixelate yields a small palette and a hard alpha

- **GIVEN** an RGBA image with a soft-edged shape
- **WHEN** `postprocess.py` runs with `--pixelate 32 --colors 8`
- **THEN** the longer side of the output is 32 pixels, at most 8 distinct opaque colours remain, and every
  alpha value is 0 or 255

### Requirement: The Image MCP Is Registered Only in Muse Code

`scripts/comfy-image-mcp/install.sh` SHALL register the server as `mcpServers.comfy-image` (`type: "http"`,
URL `http://127.0.0.1:13008/mcp`, bearer header) in the Muse Code settings of WSL and of Windows, preserving
all other keys and writing a backup first. The server SHALL NOT be declared in
`docs/agent-guide/registry/mcp.yaml`.

Rationale: the use case is Muse Code; wiring it into opencode through the registry is a separate decision.

#### Scenario: Registration merges into existing settings

- **GIVEN** a Muse `settings.json` that already declares `mcpServers.glimmer-worker`
- **WHEN** the installer registers the image server against that file
- **THEN** both `glimmer-worker` and `comfy-image` are declared and a backup of the previous file exists

### Requirement: Transparent Images Are Trimmed to the Subject

`image_generate` SHALL accept a boolean `trim` that defaults to the value of `transparent` and SHALL ignore it
when `transparent` is not set (the model output has no alpha channel); a non-boolean `trim` SHALL be rejected. When
`trim` is in effect,
`scripts/comfy-image-mcp/postprocess.py` SHALL crop the image after background removal and before pixelation to
the bounding box of the pixels with alpha of at least 128, extended by a transparent margin of
`max(1, round(0.02 × longer side))` pixels and clipped to the image. An image without an alpha channel or without
opaque pixels SHALL be left unchanged.

Rationale: the model draws cut-out subjects with a wide empty margin; without trimming a 64-pixel sprite used about
a third of its height for the subject (live run, T900379).

#### Scenario: A small subject fills the pixelated sprite

- **GIVEN** an RGBA image whose opaque subject covers a small area of a large transparent canvas
- **WHEN** `postprocess.py` runs with `--trim --pixelate 32`
- **THEN** the longer side of the output is 32 pixels and the opaque pixels reach within 2 pixels of both ends of
  that side

#### Scenario: Trim defaults to transparent

- **GIVEN** `image_generate` parameters with `transparent: true` and no `trim`
- **WHEN** the post-processing arguments are built
- **THEN** they include `--trim`, and with `trim: false` they do not

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Valid Taskfile Syntax
<!-- bats: openclaw-taskfile.bats -->

The system SHALL provide a `Taskfile.openclaw.yml` that is valid YAML and can be parsed without errors.

#### Scenario: Syntaxprüfung des OpenClaw-Taskfiles *(BATS)*
- **GIVEN** das Repository ist ausgecheckt und `taskfiles/Taskfile.openclaw.yml` existiert
- **WHEN** Python mit `yaml.safe_load` die Datei einliest
- **THEN** der Prozess endet mit Exit-Code 0 ohne Fehler

---

### Requirement: Required Task Declarations
<!-- bats: openclaw-taskfile.bats -->

The system SHALL declare all lifecycle tasks (`backup`, `install`, `configure`, `start`, `status`, `logs`, `restore`, `wipe`) in `Taskfile.openclaw.yml`.

#### Scenario: Alle Pflicht-Tasks sind vorhanden *(BATS)*
- **GIVEN** `Taskfile.openclaw.yml` ist im Repository vorhanden
- **WHEN** nach jedem der Tasks `backup`, `install`, `configure`, `start`, `status`, `logs`, `restore`, `wipe` gesucht wird
- **THEN** jeder Task ist als Top-Level-Eintrag in der Form `  <name>:` deklariert und kein Task fehlt

---

### Requirement: Local Ollama Base URL in Example Config
<!-- bats: openclaw-taskfile.bats -->

The system SHALL configure `OPENAI_BASE_URL` in `openclaw/.env.example` to point at the local Ollama endpoint `http://10.10.0.3:11434/v1`.

#### Scenario: Korrekte Base-URL für lokales Ollama *(BATS)*
- **GIVEN** `openclaw/.env.example` existiert im Repository
- **WHEN** die Datei nach dem Muster `^OPENAI_BASE_URL=http://10\.10\.0\.3:11434/v1$` durchsucht wird
- **THEN** die Zeile ist exakt so vorhanden und stimmt mit dem regulären Ausdruck überein

---

### Requirement: Chat Model Set in Example Config
<!-- bats: openclaw-taskfile.bats -->

The system SHALL define `OPENAI_MODEL` in `openclaw/.env.example` with a `qwen2.5`-series model.

#### Scenario: Chat-Modell ist gesetzt *(BATS)*
- **GIVEN** `openclaw/.env.example` existiert im Repository
- **WHEN** die Datei nach dem Muster `^OPENAI_MODEL=qwen2\.5:` durchsucht wird
- **THEN** die Zeile ist vorhanden und beginnt mit `OPENAI_MODEL=qwen2.5:`

---

### Requirement: OpenClaw Taskfile Included in Root Taskfile
<!-- bats: openclaw-taskfile.bats -->

The system SHALL include `Taskfile.openclaw.yml` in the root `Taskfile.yml` so all openclaw tasks are accessible via the standard `task` command.

#### Scenario: Einbindung im Root-Taskfile *(BATS)*
- **GIVEN** `Taskfile.yml` existiert im Wurzelverzeichnis des Repositories
- **WHEN** die Datei nach einem Verweis auf `Taskfile.openclaw.yml` durchsucht wird
- **THEN** der Verweis ist vorhanden und das Root-Taskfile bindet das OpenClaw-Taskfile ein

---

### Requirement: OpenClaw Environment File Excluded from Version Control
<!-- bats: openclaw-taskfile.bats -->

The system SHALL list `openclaw/.env` in `.gitignore` so that local credentials and model configuration are never committed to the repository.

#### Scenario: `.env` ist in `.gitignore` eingetragen *(BATS)*
- **GIVEN** `.gitignore` existiert im Wurzelverzeichnis
- **WHEN** die Datei nach dem exakten Eintrag `^openclaw/\.env$` durchsucht wird
- **THEN** der Eintrag ist vorhanden und verhindert, dass `openclaw/.env` versehentlich ins Repository gelangt

---

### Requirement: Brainstorm Tunnel Runs on Dev Node Only
<!-- bats: brainstorm-dev-host.bats -->

The system SHALL route the brainstorm tunnel exclusively through the dev-stack sish broker
(`*.dev.mentolder.de`) and SHALL NOT ship a dedicated brainstorm-sish deployment in the
prod-mentolder or prod-fleet overlays. The guard enforcing this requirement SHALL be registered
in the offline per-PR gate (`task test:unit`) and SHALL NOT be listed in
`tests/unit/.coverage-allowlist`.

#### Scenario: Kein dediziertes brainstorm-sish-Manifest in prod-mentolder *(BATS)*
- **GIVEN** das prod-mentolder Overlay-Verzeichnis ist ausgecheckt
- **WHEN** nach `brainstorm-sish.yaml` im Overlay gesucht wird
- **THEN** die Datei existiert nicht im `prod-mentolder`-Verzeichnis

#### Scenario: prod-mentolder Kustomization referenziert brainstorm-sish nicht *(BATS)*
- **GIVEN** `prod-mentolder/kustomization.yaml` ist vorhanden
- **WHEN** die Datei nach dem String `brainstorm-sish` durchsucht wird
- **THEN** kein Treffer — die Kustomization enthält keinen Verweis auf brainstorm-sish

#### Scenario: prod-fleet/mentolder patcht brainstorm-sish nicht *(BATS)*
- **GIVEN** `prod-fleet/mentolder/kustomization.yaml` ist vorhanden
- **WHEN** die Datei nach dem String `brainstorm-sish` durchsucht wird
- **THEN** kein Treffer — das Fleet-Overlay enthält keinen Patch für brainstorm-sish

#### Scenario: Dev-Stack-sish-Broker ist vorhanden und bindet `*.dev.<domain>` *(BATS)*
- **GIVEN** `k3d/dev-stack/sish.yaml` existiert
- **WHEN** die Datei nach `name: sish` und `--bind-hosts=*.${DEV_DOMAIN}` durchsucht wird
- **THEN** beide Einträge sind vorhanden — der sish-Broker im Dev-Stack ist der alleinige Brainstorm-Host

#### Scenario: Brainstorm-Taskfile publiziert an die Dev-Domain, nicht an die Prod-Domain *(BATS)*
- **GIVEN** `Taskfile.brainstorm.yml` existiert
- **WHEN** die Datei nach `brainstorm.${PROD_DOMAIN}` oder `brainstorm.mentolder.de` durchsucht wird
- **THEN** kein Treffer für Prod-Domain-Referenzen

#### Scenario: Der Guard läuft im Offline-Gate und ist nicht stillgelegt *(BATS)*
- **GIVEN** `tests/unit/.coverage-allowlist` ist die dokumentierte Liste der aus `task test:unit`
  ausgeschlossenen Testdateien, und `tests/unit/brainstorm-dev-host.bats` prüft ausschließlich
  Repo-Dateien (kein Cluster, keine DB, kein SSH)
- **WHEN** die Ausschlussliste nach dem Eintrag `brainstorm-dev-host` durchsucht wird
- **THEN** kein Treffer — der Guard wird von `task test:unit` ausgeführt und meldet eine
  Abweichung des sish-Manifests vor dem Merge statt Monate danach

### Requirement: Dev MCP Public Route is Wired Correctly
<!-- bats: dev-mcp-route.bats -->

The system SHALL expose the dev MCP monolith at `https://mcp.<DEV_DOMAIN>/{service}/mcp` via a ForwardAuth-secured IngressRoute in the dev-stack and a `--skip-auth-route` carve-out in the prod oauth2-proxy-dev.

#### Scenario: dev-stack rendert das mcp-auth-proxy-dev Deployment *(BATS)*
- **GIVEN** das dev-stack Kustomize-Overlay ist renderbar
- **WHEN** das gerenderte Manifest nach `name: mcp-auth-proxy-dev` durchsucht wird
- **THEN** das Deployment ist vorhanden

#### Scenario: mcp-auth-proxy-dev liest CLUSTER_TOKEN aus dem mcp-tokens Secret *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach `name: mcp-tokens` und `key: CLUSTER_TOKEN` gesucht wird
- **THEN** beide Einträge sind vorhanden — das Auth-Proxy liest sein Token aus dem Secret

#### Scenario: dev-stack rendert die mcp-dev IngressRoute auf dem MCP-Host *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach `name: mcp-dev` und dem Host-Matcher `Host(.mcp.` gesucht wird
- **THEN** beide Einträge sind vorhanden — die Route ist an `mcp.<DEV_DOMAIN>` gebunden

#### Scenario: mcp-dev IngressRoute routet alle vier MCP-Pfade zum Monolith *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach den PathPrefix-Einträgen für `kubernetes`, `postgres`, `github` und `browser` sowie nach `claude-code-mcp-monolith` gesucht wird
- **THEN** alle vier Pfad-Präfixe und der Monolith-Service sind vorhanden

#### Scenario: mcp-dev IngressRoute verknüpft die ForwardAuth-Chain mit mcp-auth-proxy-dev *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach dem ForwardAuth-Address `mcp-auth-proxy-dev.workspace-dev.svc.cluster.local` und dem Middleware-Namen `mcp-dev-chain` gesucht wird
- **THEN** beide Einträge sind vorhanden — die Auth-Chain ist korrekt verdrahtet

#### Scenario: prod oauth2-proxy-dev nimmt MCP-Pfade vom OIDC-Gate aus *(BATS)*
- **GIVEN** das gerenderte prod-mentolder-Manifest liegt vor
- **WHEN** nach `--skip-auth-route=^/(kubernetes|postgres|github|browser)` gesucht wird
- **THEN** der Eintrag ist vorhanden — MCP-Endpunkte umgehen das OIDC-Gate

---

### Requirement: LM Studio / Local-First LLM Integration
<!-- e2e: fa-55-lmstudio-integration.spec.ts -->

The system SHALL provide a working local-LLM coaching AI endpoint that responds within 30 seconds and does not use Anthropic cloud APIs.

#### Scenario: KI-Provider-Konfiguration liefert mindestens einen aktiven Provider *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt auf `https://web.mentolder.de`
- **WHEN** `GET /api/admin/coaching/ki-config` aufgerufen wird
- **THEN** der Response hat Status 200 und enthält mindestens einen aktiven Provider

#### Scenario: Aktiver Provider nutzt lokalen LLM-Gateway-Endpunkt, nicht Anthropic *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt und mindestens ein aktiver KI-Provider ist konfiguriert
- **WHEN** der `apiEndpoint` des aktiven Providers geprüft wird
- **THEN** der Endpunkt zeigt auf den lokalen LLM-Gateway (nicht auf `api.anthropic.com`)

#### Scenario: Coaching-Session-Erstellung und KI-Generate-API *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt und ein aktiver KI-Provider ist konfiguriert
- **WHEN** `POST /api/admin/coaching/sessions` eine neue Session erstellt und anschließend `POST .../steps/1/generate` aufgerufen wird
- **THEN** beide Requests liefern Status 200, `generate` gibt ein nicht-leeres `aiResponse` zurück und antwortet in weniger als 30 Sekunden

#### Scenario: Browser-Wizard-Flow: KI-Button wird aktiviert und zeigt Streaming-Antwort *(E2E)*
- **GIVEN** der Coaching-Wizard ist im Browser geöffnet und die Pflichtfelder sind ausgefüllt
- **WHEN** der Nutzer auf den KI-Button klickt
- **THEN** eine Streaming-Antwort erscheint im Wizard — kein Error-Toast wird angezeigt

---

### Requirement: GPU VRAM and Model Availability After Rotation
<!-- e2e: nfa-11-gpu-vram.spec.ts -->

The system SHALL keep all four Ollama models responsive and all LLM-gateway services reachable after model rotation, without exceeding available GPU VRAM.

#### Scenario: TEI-Embed-Dienst (Port 8081) ist erreichbar *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt (GPU-Host im WireGuard-Mesh)
- **WHEN** `GET http://<LLM_HOST_IP>:8081/health` aufgerufen wird
- **THEN** der Response hat Status 200

#### Scenario: TEI-Rerank-Dienst (Port 8082) ist erreichbar *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt
- **WHEN** `GET http://<LLM_HOST_IP>:8082/health` aufgerufen wird
- **THEN** der Response hat Status 200

#### Scenario: Ollama-API (Port 11434) ist erreichbar *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt
- **WHEN** `GET http://<LLM_HOST_IP>:11434/api/tags` aufgerufen wird
- **THEN** der Response hat Status 200

#### Scenario: Alle vier Ollama-Modelle antworten auf Generate-Anfragen *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt und Ollama läuft auf dem GPU-Host
- **WHEN** für jedes der Modelle `qwen2.5:14b`, `qwen2.5-coder:14b`, `qwen2.5vl:7b`, `llama3.2:3b` ein `POST /api/generate` mit einem kurzen Prompt abgesetzt wird
- **THEN** jedes Modell antwortet mit Status 200 innerhalb von 60 Sekunden

---

### Requirement: Brainstorm Tunnel Public Connectivity
<!-- e2e: nfa-12-brainstorm-tunnel.spec.ts -->

The system SHALL keep `brainstorm.mentolder.de` reachable via the dev-stack sish broker; a 502 (no active tunnel) is acceptable in CI, but 500/503/504 indicate a sish or pod failure.

#### Scenario: brainstorm.mentolder.de ist erreichbar (Basis-Konnektivität) *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt (Prod-Cluster-Kontext)
- **WHEN** `GET https://brainstorm.mentolder.de` mit bis zu 3 Weiterleitungen aufgerufen wird
- **THEN** der Response hat Status 200, 301, 302 oder 502 (kein aktiver Tunnel ist akzeptabel)

#### Scenario: Browser — brainstorm.mentolder.de liefert keine unerwarteten 5xx-Fehler *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt
- **WHEN** der Browser `https://brainstorm.mentolder.de` aufruft
- **THEN** der Response hat Status 200, 301, 302, 404 oder 502 — 500, 503 und 504 sind Fehlersignale für ein sish/Pod-Problem

---

<!-- merged from change delta llm-local-dev.md (30b19f6a474e) -->

<!-- merged from change delta llm-local-dev.md (6a596093557f) -->

<!-- merged from change delta llm-local-dev.md (82b9a43d90f4) -->

<!-- merged from change delta llm-local-dev.md (d296000fd8b1) -->

<!-- merged from change delta llm-local-dev.md (483698ba5ed8) -->

<!-- merged from change delta llm-local-dev.md (aa4b46c628fa) -->

<!-- merged from change delta llm-local-dev.md (e484f9b929b3) -->

<!-- merged from change delta llm-local-dev.md (0e1fe85961ae) -->
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

### Requirement: An active llama.cpp loadout MUST carry the configuration that makes it viable

`qwen38-220k` was disabled because it starved next to FreeToken-native (~10 tok/s measured).
It may be enabled again only with the configuration that removes that cause. While it is
enabled it MUST declare a `q4_0` KV cache for both K and V, at least two GPUs in
`env.CUDA_VISIBLE_DEVICES`, `fit.enabled: true`, and a `fit.minCtx` of at least 200000.

Rationale for each: without `q4_0` the KV pool does not fit in VRAM; without the split the
second card contributes nothing and the context collapses to roughly a third; without `fit` a
fixed context breaks as soon as another process holds VRAM; and below 200k the split is not
worth its throughput cost — measured, the split trades roughly half the decode rate for triple
the context.

The catalog no longer advertises loadout contexts: `agent-models.jsonc` declares only the
FreeToken served KV (`200000`), and the loadout floor is not coupled to a client number
(T900203).

#### Scenario: The split is removed while the loadout stays enabled

- **GIVEN** `qwen38-220k` has `enabled` other than `false`
- **AND** `env.CUDA_VISIBLE_DEVICES` names a single GPU
- **WHEN** the guard runs
- **THEN** it fails, because the loadout no longer earns its reactivation

<!-- merged from change delta llm-local-dev.md (bc970f7c2894) -->

<!-- merged from change delta llm-local-dev.md (65811522cbfe) -->

<!-- merged from change delta llm-local-dev.md (530f2980bf03) -->

<!-- merged from change delta llm-local-dev.md (7801d2a6719b) -->

<!-- merged from change delta llm-local-dev.md (58db9aa7e597) -->

<!-- merged from change delta llm-local-dev.md (13774ec922a4) -->

<!-- merged from change delta llm-local-dev.md (d4e9533f16ef) -->

<!-- merged from change delta llm-local-dev.md (db1c18946d7f) -->

<!-- merged from change delta llm-local-dev.md (25d2acd92bcd) -->

<!-- merged from change delta llm-local-dev.md (32565f7eee24) -->

<!-- merged from change delta llm-local-dev.md (03a3cf31adbf) -->

<!-- merged from change delta llm-local-dev.md (cd251269ba85) -->