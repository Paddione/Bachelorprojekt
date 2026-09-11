---
ticket_id: T900141
plan_ref: openspec/changes/modernize-llama-vim-integration/tasks.md
status: active
date: 2026-09-11
---

## Context

See `proposal.md` for motivation and `specs/vim-ai-completion.md` for observable behavior. The current machine has Vim 9.1 with jobs, timers and text properties, but no Neovim installation or Neovim configuration. The identical upstream example exists outside the repository at `~/.unsloth/llama.cpp/examples/llama.vim` and `~/opt/llama.cpp-src/examples/llama.vim`; it hardcodes non-streaming requests and keeps mutable request/render state globally. The `qwen38-220k` loadout is declared on port 8094 but was unreachable during proposal discovery, so offline startup is a normal operating state.

The repository currently has no editor-integration capability or component-map entry. This change therefore creates a new, flat `vim-ai-completion` capability rather than modifying `llm-local-dev`.

## Goals / Non-Goals

**Goals:**

- Make Vim 9.1 the tested compatibility floor and add a Neovim 0.10+ fast path without forking user-facing behavior.
- Isolate transport, stream parsing, request state, context selection, rendering, configuration and status so each can be tested independently.
- Keep installation and rollback explicit, reversible and independent of the external llama.cpp source trees.
- Bound latency, context size, retries, timers and retained buffer data.

**Non-Goals:**

- Installing Neovim, an LSP server, Tree-sitter, a plugin manager, or llama.cpp.
- Managing GPU loadouts or making port 8094 available.
- Sending repository content to non-loopback hosts by default.
- Replacing a full completion/LSP client or publishing an upstream llama.cpp PR in this change.
- Making instruct/chat completion part of the first implementation; `endpoint_inst` may be validated and discovered but FIM remains the delivered interaction.

## Decisions

### 1. Repository-owned package with explicit installer

The maintained runtime will live under `editor/llama-vim/` using Vim's native package layout:

```text
editor/llama-vim/
├── README.md
├── UPSTREAM.md
├── plugin/llama.vim
├── autoload/llama.vim
├── autoload/llama/config.vim
├── autoload/llama/context.vim
├── autoload/llama/render.vim
├── autoload/llama/request.vim
├── autoload/llama/status.vim
├── autoload/llama/stream.vim
└── lua/llama/{buffer,transport}.lua
scripts/vim/install-llama.sh
tests/fixtures/llama-vim/fake-server.mjs
tests/spec/vim-ai-completion/*.bats
docs/dev/llama-vim.md
```

The installer copies or symlinks this tree into an opt-in package location and adds a uniquely delimited loader/config block only after backing up an existing personal configuration. A `--remove` mode removes only those owned artifacts.

Alternative considered: editing or sourcing `~/opt/llama.cpp-src/examples/llama.vim`. Rejected because source rebuilds can overwrite changes and the repository cannot review or reproduce that mutable external state.

### 2. One behavioral core, two editor adapters

Portable Vimscript owns configuration, request IDs, retry policy, parsing, context ranking and public commands. A Vim adapter uses `job_start()` in raw-output mode, `job_stop()`, timers and text properties. A Neovim 0.10+ adapter uses Lua buffer attachment/extmarks and `vim.system()` with incremental stdout delivery. Both normalize events to `data(request_id, bytes)`, `error(request_id, kind, detail)` and `exit(request_id, result)`.

`nvim_buf_attach()` is used to invalidate or cancel work on buffer changes; it is not treated as an HTTP primitive. This keeps the design accurate while gaining event-driven buffer lifecycle handling. On Vim, autocommands plus `b:changedtick` provide the equivalent invalidation check.

Alternative considered: a Neovim-only Lua rewrite. Rejected because Neovim is not installed on the target workstation and Vim 9.1 is an explicit compatibility requirement. Keeping the legacy global callback design was rejected because late stdout/exit callbacks can mutate newer suggestions.

### 3. Per-buffer request state machine

Each request record contains a monotonically increasing ID, buffer number, canonical path, cursor position, starting `changedtick`, transport handle, parser state, retry attempt, timer handles and phase:

```text
idle -> scheduled -> running -> streaming -> complete
                       |  |          |
                       |  +----------+-> cancelled
                       +---------------> retry_wait -> running
                       +---------------> failed
```

The authoritative `current_by_buffer` map is checked by every event before it can update parser, ghost text, status or retry state. Cancellation marks the record first, cancels timers, stops the transport second and clears render state last. This ordering makes late callbacks harmless.

Alternative considered: one global `s:current_job`. Rejected because separate windows and buffers legitimately have independent lifecycle and render state.

### 4. Incremental framing parser and throttled rendering

`stream.vim` is a pure byte-buffer parser. It recognizes SSE records separated by blank lines, combines multiple `data:` lines, ignores comments, accepts `[DONE]`, and also accepts one-JSON-object-per-line NDJSON. Incomplete trailing bytes remain buffered until the next callback. Normalization extracts completion deltas from known llama.cpp response shapes while unknown shapes become structured parse diagnostics rather than editor errors.

Rendering is coalesced behind a short configurable timer (default around one frame, not one render per byte). The repetition guard operates on normalized accumulated content and cancels after configurable repeated token/line runs. Final non-streaming JSON remains accepted as a compatibility fallback.

Alternative considered: parsing callback lines directly. Rejected because neither job API guarantees that callback boundaries match SSE or JSON record boundaries.

### 5. Curl transport with an explicit result envelope

Both adapters invoke `curl` as an argument vector, never through an interpolated shell command. The command uses bounded connect/overall timeouts, `--no-buffer`, response headers/status capture and a reserved final status sentinel. The adapter maps curl exit codes and HTTP status into `cancelled`, `timeout`, `transport`, `http_transient`, `http_permanent` or `protocol` results. HTTP 408, 429 and 5xx are retryable by default; parse failures and other 4xx responses are not.

Retries reuse the immutable request payload, apply capped exponential backoff plus jitter, and remain subordinate to the original request ID. Default attempt and delay limits keep an offline server quiet.

Alternative considered: adding a Lua HTTP dependency. Rejected because it would complicate installation and still leave Vim needing a separate transport; `curl` is already a plugin prerequisite.

### 6. Layered configuration and hot reload

Effective configuration is built from immutable plugin defaults, the repository profile and user overrides. A schema table defines allowed keys, types, ranges, enum values, endpoint schemes and cross-field constraints. A bounded edit-distance helper provides suggestions for unknown keys. Secrets are not part of the schema.

`:LlamaReloadConfig` computes a configuration diff, cancels incompatible in-flight work, replaces only the plugin's augroup/timers and preserves reusable per-file context where limits and exclusion policy still permit it. Manual FIM remains available in excluded normal buffers, while special, binary, sensitive or non-modifiable buffers are always blocked.

Alternative considered: reading `g:llama_config` ad hoc at every call. Rejected because typos fail silently and event registrations cannot be updated consistently.

### 7. Budgeted context-provider pipeline

Context assembly uses providers in priority order: current cursor line, enclosing structure, optional LSP definition, optional LSP references, nearby prefix/suffix, then global ring chunks. A single byte/line budget truncates at provider boundaries where possible and records why chunks were omitted.

Portable structural providers use conservative filetype-specific boundary detection for the repository's common languages (Astro/Svelte, TypeScript/JavaScript, Python/Ruby, Lua and shell), with brace/search-pair or indentation fallback. Neovim's built-in LSP client is queried with a short deadline; Vim exposes an optional callback hook instead of gaining a mandatory LSP dependency. Results that arrive after the deadline are cache candidates for later requests, never blockers for the current request.

Alternative considered: mandatory Tree-sitter parsing. Rejected for the initial integration because it breaks the zero-plugin Vim baseline. The provider interface leaves room for a future Tree-sitter adapter.

### 8. File-keyed bounded ring and sensitivity guard

Ring entries carry canonical path, content hash, timestamp, filetype, source and priority. Storage is global for cross-file reuse, while active selection and requests are per buffer. Deduplication uses the existing SHA-256 approach; eviction enforces total and per-file caps. Eligibility checks run before hashing or storage and exclude no-name/special/non-modifiable/binary buffers, configured filetypes/globs and common secret/key paths.

Alternative considered: a ring per window. Rejected because windows are views and are routinely recreated; canonical files and buffers are stable ownership keys.

### 9. Capability-aware discovery and passive status

Startup schedules, but does not await, a health probe. Discovery merges `/health`, `/props` and `/v1/models` data. Explicit values always win. Without an explicit model, a candidate is selected only when endpoint metadata positively indicates FIM/infill support; otherwise configuration remains usable with a diagnostic instead of guessing from a model name. Candidate ordering is stable by server order then ID.

Status is stored data, not an active probe. `llama#statusline()` formats the latest snapshot and performs no I/O, making it safe inside Vim's statusline evaluation. `:LlamaStatus` shows full endpoint, lifecycle and last-error details. The repository profile uses `qwen38-220k` rather than the unverified display name `qwen3.8-27b` and treats 24k/context figures as discovered values, not hardcoded truth.

Alternative considered: probing synchronously during enable. Rejected because the observed endpoint was offline and editor startup must never wait on server state.

### 10. Offline-first verification

A small Node fixture server emits deterministic SSE, NDJSON, split frames, delay, repetition, 400, 429 and 503 sequences. BATS launches Vim headlessly with an isolated runtime/config directory and asserts state through deterministic result files owned by the test. Neovim-specific tests run when Neovim 0.10+ is available and otherwise skip with an explicit reason; portable parser/config/context tests always run under Vim 9.1.

## Risks / Trade-offs

- [Vim and Neovim callbacks differ in chunk and exit ordering] -> Normalize all events through request IDs and test adversarial late-output/late-exit sequences in both available adapters.
- [Frequent ghost-text updates can flicker or disturb insert mode] -> Coalesce renders and never change real buffer text before explicit acceptance.
- [Heuristic structure detection can select the wrong boundary] -> Enforce budgets, retain static prefix/suffix fallback and expose provider diagnostics.
- [LSP requests add latency or disclose more cross-file text] -> Use short deadlines, strict eligibility filters and bounded high-priority chunks; remain disabled unless an adapter is available.
- [Streaming response shapes vary across llama.cpp versions] -> Keep framing separate from payload normalization, accept final JSON fallback and use fixture coverage for known shapes.
- [A repository-owned fork can drift from upstream] -> Record source revision/hash in `UPSTREAM.md` and keep upstream sync as an explicit reviewed operation.
- [Port 8094 is exclusive with other GPU loadouts and may be offline] -> Health is passive, retries are bounded, and no server-management command is invoked.

## Migration Plan

1. Add the package, fixture tests and provenance record without touching personal configuration.
2. Validate the portable Vim path headlessly and run optional Neovim checks where available.
3. Run the installer in dry-run mode, then explicitly install after it reports the backup and owned targets.
4. Start the existing `qwen38-220k` loadout manually outside the plugin and run a local `/infill` streaming smoke test.
5. Enable auto-FIM only after manual FIM, cancellation and statusline behavior pass.

Rollback uses the installer's `--remove` mode and restores the timestamped configuration backup if the loader block changed. Because server state and external llama.cpp trees are never mutated, rollback requires no GPU or service action.

## Open Questions

- The exact FIM capability fields returned by the installed llama.cpp build can be recorded during implementation when port 8094 is running; the design already fails closed when those fields are absent.
- An upstream submission can be evaluated after the repository integration has stable tests and measured behavior.
