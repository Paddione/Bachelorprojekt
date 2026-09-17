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
FreeToken-native engine directly at `http://127.0.0.1:1919/v1`. The llm-proxy
(`:18235`) no longer sits in front of it (T900208/T900213, corrected T900222).

Rationale: mirrors the original `llamacpp-mtp` single-definition requirement —
`.opencode/agent-models.jsonc` is the sync source that
`scripts/opencode-sync-agents.sh` merges into the global config; a second
definition in the project config would silently override it (T002159, T014105).
The key keeps its historical name although no llama.cpp loadout is active behind
it anymore (T014028/T014105, consolidated 2026-09-16, T900203).

#### Scenario: Provider is declared once with the FreeToken endpoint

- **GIVEN** `.opencode/agent-models.jsonc` defines the provider `llamacpp-local`
- **WHEN** the file is parsed and the provider's `options.baseURL` inspected
- **THEN** the value is `http://127.0.0.1:1919/v1`

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
directly on `:1919` (T900203, T900208). The former per-loadout primaries
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

### Requirement: Single Static Model, No Alias Layer

The `llamacpp-local` provider SHALL declare exactly one model entry,
`Qwen3.6-35B-A3B-NVFP4`. The `freetoken-active.ts` plugin, its
`active`/`active-thinking`/`active-fast` aliases and the
`freetoken-thinking`/`freetoken-fast-*` agents SHALL NOT exist.

Rationale: the alias layer and the dynamic thinking pool were removed together
with the plugin (T900203). FreeToken serves one resident checkpoint on a static
200k KV pool; per-request thinking toggles are not wired through opencode
anymore, and the engine is not swapped from the model picker.

#### Scenario: Catalog holds the single static model

- **GIVEN** the parsed `llamacpp-local.models` object of
  `.opencode/agent-models.jsonc` and the agent roster
- **WHEN** the model keys and the agent `model` fields are inspected
- **THEN** exactly `Qwen3.6-35B-A3B-NVFP4` is declared and no
  `active`/`active-thinking`/`active-fast` alias and no
  `freetoken-thinking`/`freetoken-fast-*` agent exists

### Requirement: Measured Context Limits for the Local FreeToken Checkpoint

The `limit.context` value of the `Qwen3.6-35B-A3B-NVFP4` entry in the
`llamacpp-local` provider SHALL equal the measured usable KV capacity, not the
advertised `max_model_len`: `200000` (= served KV, `/v1/cache/status
num_pages`; advertised `max_model_len` is `262144`). Every
`llamacpp-local` `limit.context` SHALL be a positive integer, SHALL NOT equal
`262144`, and SHALL NOT exceed `200000`.

Rationale: every catalog entry promises measured context limits; a number above
the served KV dispatches into a context overflow at runtime (T002633-class,
recurring). `gpt-oss-20b` and `Gemma-4-26B-A4B-NVFP4` are no longer declared —
the static pool serves only the Qwen3.6 checkpoint (T900203).

#### Scenario: Declared context equals the served KV

- **GIVEN** the parsed `llamacpp-local.models` object of
  `.opencode/agent-models.jsonc`
- **WHEN** the `limit.context` of `Qwen3.6-35B-A3B-NVFP4` is read
- **THEN** it is `200000` and does not exceed the server's usable KV-token
  capacity

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

### Requirement: Project Default Model Targets the FreeToken Alias

The project opencode config `.opencode/opencode.jsonc` SHALL declare
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4` as its top-level default `model`. It SHALL NOT declare a
default that resolves to the retired llama.cpp loadout `llamacpp-local/qwen38-220k`
(port 8094, no longer served).

Rationale: FreeToken (Windows-native, port 1919) was re-established as the local inference
backend by operator decision (T900189), served through the llm-proxy on `:18235`.
`llamacpp-local/Qwen3.6-35B-A3B-NVFP4` (200000 served KV, moe 4150) is the active model alias
that resolves to that backend and is declared in `.opencode/agent-models.jsonc` for every
re-routed agent. A project default naming the retired llama.cpp loadout boots against a dead
backend.

#### Scenario: Default model resolves to the Qwen3.6-35B-A3B-NVFP4 alias

- **GIVEN** `.opencode/opencode.jsonc` declares its top-level `model`
- **WHEN** the value is read
- **THEN** it equals `llamacpp-local/Qwen3.6-35B-A3B-NVFP4`

### Requirement: Dead Checkpoints Are Not Declared

The provider catalogs in `.opencode/agent-models.jsonc` SHALL NOT declare
model entries whose weights no longer exist on disk. The `llamacpp-local`
catalog SHALL declare exactly `Qwen3.6-35B-A3B-NVFP4`; the retired keys
`qwen38-220k`, `gptoss-context`, `gemma26-factory`, `gemma4`,
`gemma26-throughput`, `gemma12-vision` and `hauhau-qwen36` SHALL NOT be
declared.

Rationale: every catalog entry promises measured context limits; an entry
without weights cannot honor them and dispatches into the void (T002633-class,
recurring). The former fallback entries (`hauhau-qwen36`, `gemma12-vision`,
`qwen38-220k`) are gone as well — the FreeToken consolidation leaves a single
resident checkpoint (T900203, T016419).

#### Scenario: Dead catalog keys are absent

- **GIVEN** the parsed `llamacpp-local.models` object of
  `.opencode/agent-models.jsonc`
- **WHEN** its keys are inspected
- **THEN** `Qwen3.6-35B-A3B-NVFP4` is declared and none of `qwen38-220k`,
  `gptoss-context`, `gemma26-factory`, `gemma4`, `gemma26-throughput`,
  `gemma12-vision`, `hauhau-qwen36` is declared

### Requirement: FreeToken Plugin Layer Removed

The `freetoken-active.ts` plugin SHALL NOT exist — neither in the repository
(`.opencode/plugin/`) nor in the global opencode plugin directory. Its alias
telemetry, engine auto-swap, engine stop, degraded failure path, fetch-wrapper
consistency guard and the BATS coverage for auto-swap SHALL NOT be re-added
without a new requirement.

Rationale: the plugin was removed together with the alias layer (T900203).
FreeToken serves one resident checkpoint on a static 200k KV pool; there is no
per-request thinking toggle, no engine switching from the model picker, and no
telemetry file. The provider is wired statically through the llm-proxy.

#### Scenario: Plugin file is absent

- **GIVEN** the repository directory `.opencode/plugin/`
- **WHEN** its entries are listed
- **THEN** `freetoken-active.ts` is not among them

### Requirement: V2 Compaction Targets 100K Active Context

The project opencode config SHALL declare a V2 `compaction` block with
`auto: true`, `keep.tokens: 16000` and `buffer: 96000`, with a comment showing
the threshold math for the 200k factory model.

Rationale: V2 computes the preflight threshold as
`context − max(output, buffer)` (verified against
`packages/core/src/session/compaction.ts` and
`https://opencode.ai/v2/docs/compaction/`). With `context: 200000` and
`output: 8192`, `buffer: 96000` yields compaction at ≈104k active context;
`keep.tokens: 16000` keeps the 12–20k recent tail. The V1 keys `reserved` and
`preserve_recent_tokens` are ignored by V2 and SHALL NOT appear.

#### Scenario: Compaction block present with V2 keys

- **GIVEN** `.opencode/opencode.jsonc` on the feature branch
- **WHEN** the `compaction` block is inspected
- **THEN** it contains `auto: true`, `keep.tokens: 16000`, `buffer: 96000`
  and no `reserved` or `preserve_recent_tokens` key

#### Scenario: Threshold math holds for the factory model

- **GIVEN** the factory model limit `context: 200000`, `output: 8192`
- **WHEN** `200000 − max(8192, 96000)` is computed
- **THEN** the result is `104000` (≈100k operating target)

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
(FreeToken via the llm-proxy, historical key name), or a llama.cpp loadout that is
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