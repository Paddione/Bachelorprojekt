---
title: "p2 — Context, Neovim adapters, discovery and status"
ticket_id: T900141
domains: [vim, llm-local-dev]
status: pending
role: impl
depends_on: [p1]
target_files:
  - editor/llama-vim/autoload/llama/context.vim
  - editor/llama-vim/autoload/llama/status.vim
  - editor/llama-vim/lua/llama/buffer.lua
  - editor/llama-vim/lua/llama/transport.lua
---

# p2-context-adapters — Implementation Plan

_Context, Neovim adapters, discovery and status_

## File Structure

```text
editor/llama-vim/autoload/llama/context.vim     # NEW: portable context providers, eligibility and bounded cross-file ring
editor/llama-vim/autoload/llama/status.vim      # NEW: async discovery state, immutable snapshots and presentation
editor/llama-vim/lua/llama/buffer.lua           # NEW: Neovim buffer invalidation, extmark-facing hooks and deadline-bounded LSP provider
editor/llama-vim/lua/llama/transport.lua        # NEW: Neovim 0.10+ vim.system transport adapter
```

## Scope and dependency boundary

This partial implements the context/discovery side of REQ-VIM-AI-006 through REQ-VIM-AI-008 and
the optional Neovim adapter side of REQ-VIM-AI-002. It owns only the four files in
`target_files`. Tests and fixtures are owned by the final test partial; p2 uses their focused
commands once available but does not edit them.

All four target files are absent at plan time. Scoped `plan-intel-filter.sh` output therefore has
no existing symbols or call graph for them. Names under **Interface contract** below are new
implementation contracts, not claims about current code. They were synchronized with p1 in the
index review; an implementation must not create a second callback vocabulary.

## S1 current, baseline and effective budget

`docs/code-quality/gates.yaml` defines no S1 extension limit for `.vim` or `.lua`, and
`docs/code-quality/baseline.json` has no key for any target. Consequently the S1 ratchet does not
set a numeric effective threshold for these files. The suggested cuts below are maintainability
targets with growth reserve, not baseline exceptions.

| File | Current / baseline | Effective S1 threshold and budget |
|---|---:|---|
| `editor/llama-vim/autoload/llama/context.vim` | 0 lines (new) / absent | not scoped by S1; numeric budget not applicable; aim below 450 lines and extract in a future scoped module rather than compressing if exceeded |
| `editor/llama-vim/autoload/llama/status.vim` | 0 lines (new) / absent | not scoped by S1; numeric budget not applicable; aim below 260 lines |
| `editor/llama-vim/lua/llama/buffer.lua` | 0 lines (new) / absent | not scoped by S1; numeric budget not applicable; aim below 300 lines |
| `editor/llama-vim/lua/llama/transport.lua` | 0 lines (new) / absent | not scoped by S1; numeric budget not applicable; aim below 260 lines |

No baseline or ignore entry may be added. Re-check the gate configuration at implementation time;
if `.vim` or `.lua` has become scoped, use its then-current configured limit as the effective
threshold for these still-new files.

## Interface contract

### Existing runtime APIs (real)

- Vim 9.1 primitives: `sha256()`, buffer-local `b:changedtick`, `bufname()`, `getbufline()`,
  `getbufvar()`, `resolve()`, `fnamemodify()`, timers and Funcrefs.
- Neovim 0.10+ primitives: `vim.system(argv, opts, on_exit)`, `vim.schedule()`,
  `vim.api.nvim_buf_attach()`, `vim.api.nvim_buf_is_valid()`, `vim.api.nvim_buf_get_changedtick()`
  and the built-in `vim.lsp` client APIs. These are optional; requiring either Lua module outside
  Neovim must never occur on the Vim 9.1 path.

### Interface contract (synchronized with p1; SSOT: `tasks.md` §Interface contract)

P1 provides and p2 calls. P2 does not duplicate request-currentness, parsing, retry or config logic.

- `llama#config#current()` returns a detached copy of the validated effective configuration,
  including context/ring limits, exclusions, LSP enable/deadline, discovery endpoints and the
  `explicit_keys` provenance from `llama#config#load()`, so discovery cannot overwrite explicit values.
- After a successful `:LlamaReloadConfig` and on `:LlamaEnable`, p1's plugin wiring calls
  `llama#context#on_config(config)` and `llama#status#start(config)` guarded by `exists()`.
  There is no listener registry.
- `llama#request#on_data(request_id, bytes)`, `llama#request#on_error(request_id, kind, detail)`
  and `llama#request#on_exit(request_id, result)` are the only transport ingress. P1 checks request
  ID and `changedtick` before parsing, rendering, retrying or changing status.
- `llama#request#cancel(bufnr, reason)` marks current work cancelled before p1 stops transport and
  timers and clears rendering. `buffer.lua` calls it through `vim.schedule()`.
- `llama#request#probe(url, timeout_ms, Callback)` performs one bounded non-FIM GET through p1's
  curl envelope and calls back once with `{ok, http_status, body, kind, detail}`. No retry and no
  stream parser. `llama#statusline()` never reaches it.
- `llama#statusline()` is defined only in p1's `editor/llama-vim/autoload/llama.vim` and forwards to
  `llama#status#statusline()`. Defining it in `status.vim` violates Vim's autoload rule (E746).
- On `has('nvim-0.10')`, p1's `request.vim` selects `require('llama.transport')` and p1's
  `render.vim` delegates ghost text to `require('llama.buffer')`.

P2 provides:

- `llama#context#build(bufnr, position, config)` returns `{ok, payload, diagnostics}` and is the only
  context entry p1 calls. It runs eligibility, providers and budgeting internally. `payload` carries
  `input_prefix`, `input_suffix`, `input_extra` (llama.cpp `{filename, text}` entries built from
  ranked chunks `{source, path, text, priority, content_hash}`) and a `usage` summary.
- `llama#context#remember(bufnr)` checks eligibility before reading, hashing or storing.
- `llama#context#add_extra(bufnr, chunks)` validates and caches late LSP or Vim-callback chunks for
  later requests. It never mutates an already returned payload.
- `llama#context#stats()` returns counts and bytes only. `llama#context#on_config(config)` prunes
  retained data to the new limits and exclusions.
- `llama#status#start(config)`, `llama#status#record(event, fields)`, `llama#status#snapshot()`,
  `llama#status#show()` and the pure formatter `llama#status#statusline()`.
- `require('llama.transport').start(spec)` returns an opaque handle and forwards events to the three
  `llama#request#on_*` functions. `.stop(handle)` is idempotent.
- `require('llama.buffer').attach(bufnr, opts)`, `.detach(bufnr)`,
  `.collect_lsp(bufnr, cursor, deadline_ms, callback)` (calls back once with normalized chunks),
  `.render(bufnr, request_id, anchor, text)` and `.clear(bufnr, request_id)` for extmark ghost text.

## Task 1 — Lock the adapter contracts and create guarded modules (1 hour)

- Create the four modules with script/module-local state and the exported entry points above.
- Add explicit Vim/Neovim version and capability guards. Vim must never evaluate `require()`;
  Neovim adapters must fail closed with a structured capability diagnostic below version 0.10.
- Document argument/result shapes at each public boundary, including ownership: p1 owns request
  currency and parser/retry state; `context.vim` owns retained chunks; `status.vim` owns only
  displayable snapshots; Lua adapters own only native handles/attachments.
- Use opaque handles and copied Dict/table payloads so consumers cannot mutate module state.
- Confirm names against p1's actual exported functions before progressing. If p1 differs, update
  this contract and the index review coherently rather than adding aliases ad hoc.
- Confirm p1's `autoload/llama.vim` public `llama#statusline()` forwards without side effects to
  p2's `llama#status#statusline()`; stop on a contract mismatch rather than adding a second facade.

Acceptance:

- Sourcing the portable plugin under Vim 9.1 does not load Lua or call Neovim APIs.
- Requiring both Lua modules under Neovim 0.10+ returns tables with the documented functions.
- No callback path bypasses the three `llama#request#on_*` functions or duplicates p1's
  current-request check.

## Task 2 — Implement eligibility and the bounded file-keyed ring (2 hours)

- In `context.vim`, canonicalize a named buffer path with `resolve()` plus absolute
  `fnamemodify(..., ':p')` normalization before using it as a key. Treat buffers/windows as views;
  never key reusable context by window ID.
- Reject no-name, unlisted, special (`&buftype`), non-modifiable, binary and unloaded buffers
  before reading their text. Apply configured filetype/glob and secret-like path exclusions before
  hashing or retaining content.
- Store eligible entries as canonical path, SHA-256 content hash, timestamp, filetype, source,
  priority, text and measured byte/line cost. Deduplicate identical path/hash entries.
- Enforce both per-file and total chunk limits deterministically: evict lowest priority, then oldest,
  then stable path/hash order. Hot reload immediately removes newly ineligible or over-limit entries.
- Keep active selection local to the caller buffer even though the reusable ring is global.

Acceptance:

- Two buffers can remember/select context without overwriting one another's request ownership.
- Revisiting an eligible file reuses one deduplicated entry; repeated events do not grow the ring.
- A `.env`, key/certificate-like path, binary or special buffer is neither hashed nor stored nor
  returned as extra context.
- Total and per-file limits hold after inserts, reload pruning and deterministic eviction.

## Task 3 — Build budgeted structural and fallback providers (2 hours)

- Make providers return candidate chunks rather than concatenate strings. Rank in this order:
  cursor line, enclosing structure, timely LSP definition, timely LSP references, nearby
  prefix/suffix, then ordinary ring chunks.
- Add conservative enclosing function/class discovery for Astro/Svelte, TypeScript/JavaScript,
  Python/Ruby, Lua and shell. Prefer complete boundaries only when the candidate fits; ambiguous or
  malformed syntax falls back instead of guessing across large regions.
- Maintain independent byte and line accounting for prefix, suffix and extra chunks. Truncate at
  provider/chunk boundaries where possible; if the cursor-local fallback itself must be cut, do so
  deterministically nearest the cursor and record the reason.
- Label every cross-file or LSP chunk with its canonical path. Deduplicate LSP/ring overlap by
  canonical path plus content hash.
- Return diagnostics for omitted provider, deadline, invalid range and exhausted budget without
  turning absence of structure/LSP into a fatal error.

Acceptance:

- A fitting supported-language function retains its signature and relevant body up to the cursor.
- Unsupported, ambiguous and oversized structures produce bounded prefix/suffix context.
- No assembled result exceeds either configured byte or line budget, including labels/separators.
- LSP definition/reference chunks rank above ordinary ring entries but below cursor/structure data.

## Task 4 — Add Vim's optional context-provider hook (1 hour)

- Let `llama#context#build()` invoke the validated optional Vim callback from `llama#config#current()`
  with buffer, cursor and remaining budget; do not add a mandatory Vim LSP dependency.
- Validate callback output into the same normalized chunk shape used by Neovim. Reject invalid
  paths/ranges/types as diagnostics and continue with portable providers.
- Enforce a caller-supplied deadline contract: late results may be cached for a later request only
  after eligibility validation, and never mutate the already-returned assembly.
- Contain callback exceptions and preserve the bounded fallback path.

Acceptance:

- With no callback configured, context assembly completes through structure/fallback providers.
- Valid definition/reference chunks receive the same ranking, deduplication and budget treatment as
  Neovim LSP chunks.
- Missing, throwing, malformed or late callbacks do not block or fail the FIM request.

## Task 5 — Implement Neovim buffer invalidation and LSP enrichment (2 hours)

- In `buffer.lua`, keep attachment records per buffer, never per window. Make repeated `attach()`
  idempotent and `detach()` safe after buffer deletion.
- Use `nvim_buf_attach()` callbacks only for buffer lifecycle/invalidation. Schedule Vimscript calls
  out of fast-event context; on change/detach call p1 cancellation with buffer number and a stable
  reason. Do not use buffer attachment as an HTTP mechanism.
- Compare the native changed tick with the request-start tick supplied in `opts`; late callbacks
  for a detached/re-attached buffer generation must be ignored.
- Query attached Neovim LSP clients for definition and references at the requested position. Normalize
  locations/location-links into canonical-path chunks, validate readable eligible files and return
  one callback result when all clients reply or the deadline expires.
- Cancel/ignore the deadline timer after completion. Results after the deadline may enter the safe
  cache path for a later request, but must not modify current assembly or call the completion callback
  twice. Late results go to `llama#context#add_extra(bufnr, chunks)`.
- Implement `render()` and `clear()` with one plugin-owned extmark namespace and virtual text keyed
  by request ID. They never change real buffer lines. Ownership checks stay in p1's `render.vim`.

Acceptance:

- Edits in buffer A cancel only A; buffer B's request and rendered state remain untouched.
- Repeated attach/reload does not duplicate callbacks, leak timers or act on stale buffer generations.
- Timely definitions precede references and ring chunks; duplicate locations collapse by path/hash.
- No client, client error, invalid range or deadline expiry returns an empty enrichment plus a
  non-fatal diagnostic quickly enough for portable fallback to proceed.

## Task 6 — Implement the Neovim `vim.system` transport (2 hours)

- Accept only a validated argv array and structured options from p1. Invoke `vim.system()` directly;
  never concatenate a shell command or interpolate endpoint/payload text through a shell.
- Configure incremental stdout delivery and forward raw bytes, including partial frames, unchanged
  to `llama#request#on_data(request_id, bytes)`. Do not parse SSE/NDJSON in Lua.
- Buffer stderr only within a configured diagnostic cap. Translate spawn/callback failures into the
  p1 envelope while leaving curl-exit/HTTP classification to the owning p1 policy.
- Ensure exactly one terminal `exit` event is emitted. Make cancellation idempotent, terminate the
  native process, and tolerate stdout/on-exit callbacks arriving after cancellation; p1's request-ID
  gate remains authoritative.
- Marshal all Vimscript callbacks through `vim.schedule()` where required and copy callback payloads
  so later native-buffer reuse cannot change an emitted event.

Acceptance:

- Arbitrarily split stdout reaches p1 in order and is not decoded or line-split by the adapter.
- Cancellation can race with stdout/exit without a Lua exception, duplicate exit or stale render.
- Arguments containing spaces/metacharacters remain single argv elements and cause no shell execution.
- Missing `vim.system` yields a structured unsupported-capability result and never registers auto-FIM.

## Task 7 — Implement passive discovery and status snapshots (2 hours)

- In `status.vim`, schedule independent bounded probes for `/health`, `/props` and `/v1/models`
  after enable/reload through `llama#request#probe()`, decoding complete bodies with `json_decode()`
  inside `try`/`catch`. Startup returns before any probe completes; do not add an unbounded health
  retry loop.
- Merge results deterministically. Explicit endpoint/model configuration always wins. Without an
  explicit model, select only candidates positively marked FIM/infill-capable; order candidates by
  server response order then ID and retain an explanatory diagnostic when capability is ambiguous.
- Keep discovered context capacity as optional metadata, not a hardcoded truth. Derive the displayed
  port from the effective endpoint and merge `llama#context#stats()` counts/bytes without exposing
  retained text.
- Record connection state, endpoint, port, model, context capacity, ring usage, current lifecycle,
  last structured error and update time in a copied snapshot. Request callbacks may update stored
  state through `llama#status#record()` only after p1 accepts the current request event.
- Make `llama#status#show()` format full operator details. Make
  `llama#status#statusline()` a pure, exception-safe formatter of the latest snapshot with no probe,
  timer, job, file or buffer access; p1's required public `llama#statusline()` only forwards to it.

Acceptance:

- With port 8094 offline, enable/startup remains responsive and status settles to `unreachable`
  after the bounded probe, with no retry storm.
- An explicit `qwen38-220k` remains selected while discovery enriches metadata.
- With no explicit model, only positive FIM metadata can select a model; ambiguous/name-only matches
  remain unselected with a diagnostic.
- Repeated statusline evaluation produces identical output/state and creates no job, timer or HTTP
  request; the command view includes known connection, port, model, capacity, ring and last-error data.

## Task 8 — Focused integration verification (1.5 hours)

- Source the plugin headlessly under Vim 9.1 with an isolated runtime and exercise portable
  `remember()`, `build()`, status snapshot and statusline entry points. Confirm no Neovim API is
  touched and no real home-directory state changes.
- After the test partial provides its fixtures, run:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/vim-ai-completion/context-status.bats
tests/unit/lib/bats-core/bin/bats tests/spec/vim-ai-completion/request-stream.bats
```

- On Neovim 0.10+, run the fixture cases for buffer A/B isolation, changedtick invalidation,
  split-byte forwarding, cancel/exit races, timely/late LSP and missing-LSP fallback. If Neovim is
  absent or older, require the test's explicit versioned skip and keep all Vim cases green.
- Run `task test:changed`, `task freshness:regenerate` and `task freshness:check`. Inspect generated
  changes and keep only artifacts expected from the separate test partial; do not add an S1 baseline
  entry for `.vim` or `.lua`.

Completion requires focused evidence for context boundaries/budgets, LSP priority/fallback,
multi-buffer isolation, sensitive-data exclusion, deterministic discovery, offline startup and a
side-effect-free statusline. Live availability of port 8094 is not a gate.
