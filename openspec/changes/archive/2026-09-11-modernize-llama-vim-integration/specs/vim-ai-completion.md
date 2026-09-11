## Purpose

Diese Capability stellt eine reproduzierbare, lokale FIM-Vervollständigung für Vim und Neovim bereit, die auch bei langsamen, wechselnden oder nicht gestarteten llama.cpp-Endpunkten kontrollierbar und transparent bleibt.

## ADDED Requirements

### Requirement: REQ-VIM-AI-001 Repository-owned and reversible installation

The system SHALL keep the maintained plugin source, its provenance, its documented defaults, and its verification assets in the repository. Installation into a user's editor directory SHALL be explicit and idempotent, SHALL preserve an existing configuration before changing it, and SHALL provide a documented removal path. It SHALL NOT modify the llama.cpp example copies under `~/.unsloth` or `~/opt/llama.cpp-src`.

#### Scenario: First installation preserves personal configuration

- **GIVEN** a user has an existing `~/.vimrc` and no repository-managed llama.vim installation
- **WHEN** the user explicitly runs the installation command
- **THEN** the existing configuration is backed up before any opt-in loader snippet is added and the plugin is installed from the repository-owned source

#### Scenario: Repeated installation is idempotent

- **GIVEN** the repository-managed plugin and loader snippet are already installed
- **WHEN** the user runs the installation command again
- **THEN** no duplicate loader or configuration block is created

#### Scenario: Removal leaves upstream examples untouched

- **GIVEN** the repository-managed plugin is installed and external llama.cpp example copies exist
- **WHEN** the documented removal procedure is executed
- **THEN** only repository-managed installation artifacts are removed and both external example copies remain unchanged

### Requirement: REQ-VIM-AI-002 Compatible and race-safe request lifecycle

The plugin SHALL support Vim 9.1 with job and text-property features and Neovim 0.10 or newer. It SHALL assign each FIM request a unique identity, allow at most one active FIM request per buffer, cancel superseded work, and ignore every callback or event that does not belong to the current request and unchanged buffer state.

#### Scenario: Superseded response cannot replace current ghost text

- **GIVEN** request A is active for a buffer and a cursor or text change starts request B
- **WHEN** request A emits data or exits after request B became current
- **THEN** request A is ignored and only request B may update the visible suggestion

#### Scenario: Vim fallback remains functional without Neovim

- **GIVEN** Vim 9.1 has job and text-property support and Neovim is not installed
- **WHEN** the plugin is enabled and a FIM request is triggered
- **THEN** the request, cancellation, streaming, and ghost-text lifecycle operate through the Vim-compatible adapter

#### Scenario: Unsupported editor fails closed

- **GIVEN** an editor lacks the required asynchronous job or ghost-text capability
- **WHEN** the plugin is enabled
- **THEN** it reports the missing capability and does not register automatic FIM requests

### Requirement: REQ-VIM-AI-003 Progressive SSE and NDJSON completion

The plugin SHALL request streaming FIM output and incrementally parse both SSE and NDJSON framing across arbitrary transport chunk boundaries. It SHALL render only the accumulated completion for the current request, SHALL expose a configurable render throttle, and SHALL stop a completion when the server finishes, the user cancels, the buffer changes, or a configured repetition guard fires.

#### Scenario: Partial frames are reassembled

- **GIVEN** one SSE or NDJSON record is split across multiple stdout callbacks
- **WHEN** all fragments arrive for the current request
- **THEN** the parser emits the record exactly once and the ghost text contains the ordered accumulated completion

#### Scenario: First tokens become visible before request exit

- **GIVEN** the endpoint streams multiple valid completion records over time
- **WHEN** the first content-bearing record arrives
- **THEN** ghost text becomes visible before the transport process exits

#### Scenario: Repetition guard terminates a bad completion

- **GIVEN** a stream exceeds the configured repeated-token or repeated-line threshold
- **WHEN** the repetition guard recognizes the pattern
- **THEN** the active request is cancelled and no further output from it is rendered

### Requirement: REQ-VIM-AI-004 Structured errors and bounded recovery

The plugin SHALL distinguish cancellation, transport failure, timeout, malformed stream data, transient HTTP failure, and permanent HTTP failure. It SHALL retry only configured transient failures with exponential backoff and jitter, SHALL enforce a finite attempt limit, and SHALL cancel pending retries when the originating request is superseded or the plugin is disabled.

#### Scenario: Transient failure recovers

- **GIVEN** the endpoint responds with HTTP 503 for the first request and succeeds on the next permitted attempt
- **WHEN** retry is enabled
- **THEN** the plugin retries after a backoff delay and renders the successful completion without a permanent error state

#### Scenario: Permanent failure is not retried

- **GIVEN** the endpoint responds with a non-retryable HTTP 400 response
- **WHEN** the request completes
- **THEN** the plugin exposes the structured error and schedules no retry

#### Scenario: Disabling cancels delayed retry

- **GIVEN** a retry timer is pending
- **WHEN** the user disables the plugin or reloads to a configuration where FIM is disabled
- **THEN** the timer is cancelled and no additional request is sent

### Requirement: REQ-VIM-AI-005 Validated and hot-reloadable configuration

The plugin SHALL validate configuration keys, types, ranges, endpoint schemes, and mutually dependent values before enabling automatic completion. Unknown keys SHALL produce a diagnostic with a nearest-key suggestion when one is unambiguous. A `:LlamaReloadConfig` command SHALL re-read configuration, update affected autocommands and timers, and preserve unrelated editor state. Auto-FIM SHALL be disabled for configurable filetypes and special or non-modifiable buffers.

#### Scenario: Typo receives an actionable warning

- **GIVEN** configuration contains `endpiont_fim` and no `endpoint_fim`
- **WHEN** configuration is validated
- **THEN** automatic FIM is not started with that invalid key and the diagnostic suggests `endpoint_fim`

#### Scenario: Excluded filetype never triggers automatic FIM

- **GIVEN** `markdown` is listed in `filetype_exclude`
- **WHEN** insert-mode or cursor events occur in a Markdown buffer
- **THEN** no automatic FIM request is sent while an explicitly documented manual action remains available

#### Scenario: Reload updates event registration

- **GIVEN** the plugin is enabled and the user changes the exclusion list or debounce settings
- **WHEN** `:LlamaReloadConfig` is executed
- **THEN** subsequent events use the new values without requiring `:LlamaDisable` followed by `:LlamaEnable`

### Requirement: REQ-VIM-AI-006 Language-aware context with graceful fallback

The plugin SHALL prefer complete enclosing function or class boundaries when the current filetype has a supported structural context provider, subject to configured byte and line budgets. It SHALL optionally prioritize LSP definitions and references for the symbol at the cursor, SHALL label cross-file chunks with their canonical file path, and SHALL fall back to bounded prefix/suffix text when structure or LSP data is unavailable, late, or invalid.

#### Scenario: Enclosing function is retained within budget

- **GIVEN** the cursor is inside a supported language function whose body fits the configured context budget
- **WHEN** the FIM request context is assembled
- **THEN** the prefix contains the function signature and relevant body up to the cursor rather than beginning at an arbitrary static line offset

#### Scenario: LSP definition receives priority

- **GIVEN** an attached LSP client returns a definition for the symbol under the cursor before the context deadline
- **WHEN** extra context is ranked
- **THEN** the definition chunk is included ahead of ordinary ring-buffer chunks without exceeding the request budget

#### Scenario: Missing LSP does not block completion

- **GIVEN** no LSP client is attached or the LSP deadline expires
- **WHEN** context is assembled
- **THEN** the request proceeds with structural or bounded text context and reports no fatal error

### Requirement: REQ-VIM-AI-007 Multi-buffer context isolation and reuse

The plugin SHALL keep context and request state keyed by buffer identity and canonical file path so that multiple windows do not overwrite each other's active state. A global bounded ring MAY reuse eligible cross-file chunks across buffers, but SHALL deduplicate content, enforce per-file and total limits, and exclude unlisted, secret-like, binary, special, or non-modifiable buffers.

#### Scenario: Two windows retain independent requests

- **GIVEN** two editable files are visible in separate windows
- **WHEN** each buffer starts a FIM request
- **THEN** cancellation or rendering in one buffer does not cancel or render into the other buffer

#### Scenario: Returning to a file reuses safe context

- **GIVEN** a file contributed an eligible chunk and the user later returns to that file
- **WHEN** context is assembled before the chunk is evicted
- **THEN** the deduplicated file-keyed chunk remains available within the configured limits

#### Scenario: Secret-like buffer is never retained

- **GIVEN** a buffer path or type matches a configured sensitive-data exclusion
- **WHEN** buffer events are processed
- **THEN** its content is neither sent as extra context nor stored in the global ring

### Requirement: REQ-VIM-AI-008 Endpoint discovery and observable health

The plugin SHALL probe configured health, properties, and model-list endpoints asynchronously without blocking editor startup. Explicit endpoint and model values SHALL take precedence. Auto-detection SHALL select only a loaded model positively identified as FIM-compatible and SHALL otherwise retain the explicit/default choice with an explanatory diagnostic. `:LlamaStatus` and a side-effect-free statusline function SHALL expose connection state, endpoint port, selected model, effective context capacity when known, ring usage, and the last structured error.

#### Scenario: Offline startup remains usable

- **GIVEN** no process listens on the configured endpoint during editor startup
- **WHEN** the health probe times out or refuses the connection
- **THEN** editor startup completes, status becomes `unreachable`, and no unbounded retry loop is started

#### Scenario: Explicit model wins over discovery

- **GIVEN** `model_fim` is explicitly configured and the model endpoint lists multiple loaded models
- **WHEN** discovery completes
- **THEN** the explicit model remains selected and discovery only enriches status metadata

#### Scenario: Compatible model is auto-selected

- **GIVEN** no model is explicitly configured and model metadata positively marks one or more loaded models as FIM-compatible
- **WHEN** discovery completes
- **THEN** the first deterministic compatible candidate is selected and displayed in status

### Requirement: REQ-VIM-AI-009 Safe project defaults

The repository profile SHALL provide overridable defaults for the local llama.cpp FIM endpoint at `http://127.0.0.1:8094/infill`, model identifier `qwen38-220k`, 512 prefix lines, 64 suffix lines, and 32 cross-file chunks. Enabling the plugin SHALL NOT start, stop, switch, or deploy an LLM server, and the default endpoint SHALL remain loopback-only unless the user explicitly configures another host.

#### Scenario: Defaults target the declared local loadout

- **GIVEN** the user enables the repository profile without endpoint overrides
- **WHEN** effective configuration is inspected
- **THEN** it contains the port-8094 FIM endpoint, model `qwen38-220k`, prefix 512, suffix 64, and ring limit 32

#### Scenario: Enable does not mutate server state

- **GIVEN** the configured server is stopped or another exclusive GPU loadout is active
- **WHEN** the plugin is enabled or its health check runs
- **THEN** no server-management, model-switch, deployment, or GPU-mutating command is executed
