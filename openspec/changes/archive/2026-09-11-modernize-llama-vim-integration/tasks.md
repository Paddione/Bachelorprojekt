---
title: "modernize-llama-vim-integration — Implementation Plan"
ticket_id: T900141
domains: [vim, llm-local-dev]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# modernize-llama-vim-integration — Implementation Plan

_Ticket: T900141_

Index of four disjoint partials. Behavior is specified in `specs/vim-ai-completion.md`,
architecture in `design.md`. Each partial carries its own tasks, S1 budget notes and focused
verification.

## File Structure

```text
editor/llama-vim/plugin/llama.vim              # NEW (p1): commands, capability guard, plugin augroup
editor/llama-vim/autoload/llama.vim            # NEW (p1): E746-compliant public facade
editor/llama-vim/autoload/llama/config.vim     # NEW (p1): schema, defaults, reload diff, eligibility
editor/llama-vim/autoload/llama/request.vim    # NEW (p1): request-ID state machine, curl job, retry, probe
editor/llama-vim/autoload/llama/stream.vim     # NEW (p1): incremental SSE/NDJSON/final-JSON parser
editor/llama-vim/autoload/llama/render.vim     # NEW (p1): owner-scoped ghost text, accept, repetition guard
editor/llama-vim/autoload/llama/context.vim    # NEW (p2): providers, budget, file-keyed ring
editor/llama-vim/autoload/llama/status.vim     # NEW (p2): discovery, snapshots, status formatting
editor/llama-vim/lua/llama/buffer.lua          # NEW (p2): Neovim attach, extmark render, LSP enrichment
editor/llama-vim/lua/llama/transport.lua       # NEW (p2): Neovim vim.system transport
editor/llama-vim/README.md                     # NEW (p3): install and usage quick path
editor/llama-vim/UPSTREAM.md                   # NEW (p3): provenance and sync procedure
scripts/vim/install-llama.sh                   # NEW (p3): dry-run/install/remove lifecycle
docs/dev/llama-vim.md                          # NEW (p3): operation, troubleshooting, rollback
openspec/component-map.yaml                    # MODIFIED (p3): route editor/llama-vim and scripts/vim
tests/fixtures/llama-vim/fake-server.mjs       # NEW (p4): deterministic offline llama.cpp fixture
tests/spec/vim-ai-completion/request-stream.bats   # NEW (p4): REQ-002/003/004
tests/spec/vim-ai-completion/install-config.bats   # NEW (p4): REQ-001/005/009
tests/spec/vim-ai-completion/context-status.bats   # NEW (p4): REQ-006/007/008
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-core-runtime.md | impl | editor/llama-vim/plugin/llama.vim, editor/llama-vim/autoload/llama.vim, editor/llama-vim/autoload/llama/config.vim, editor/llama-vim/autoload/llama/request.vim, editor/llama-vim/autoload/llama/stream.vim, editor/llama-vim/autoload/llama/render.vim | |
| p2 | tasks.d/p2-context-adapters.md | impl | editor/llama-vim/autoload/llama/context.vim, editor/llama-vim/autoload/llama/status.vim, editor/llama-vim/lua/llama/buffer.lua, editor/llama-vim/lua/llama/transport.lua | p1 |
| p3 | tasks.d/p3-packaging-docs.md | impl | editor/llama-vim/README.md, editor/llama-vim/UPSTREAM.md, scripts/vim/install-llama.sh, docs/dev/llama-vim.md, openspec/component-map.yaml | p1, p2 |
| p4 | tasks.d/p4-tests.md | tests | tests/fixtures/llama-vim/fake-server.mjs, tests/spec/vim-ai-completion/request-stream.bats, tests/spec/vim-ai-completion/install-config.bats, tests/spec/vim-ai-completion/context-status.bats | |

Execution order: p4 writes the RED tests first (no dependency), then p1, p2 and p3. p4 is listed
last because the manifest requires the tests role in the final row.

## Interface contract

All names are new. Partials implement exactly these names and add no aliases.

| Owner | Symbol | Contract |
|---|---|---|
| p1 | `g:llama_config`, `g:loaded_repo_llama_vim` | user override Dict, single-load guard |
| p1 | `:LlamaEnable :LlamaDisable :LlamaFim :LlamaCancel :LlamaAccept :LlamaAcceptLine :LlamaReloadConfig :LlamaStatus` | public commands |
| p1 | `llama#fim(manual)`, `llama#fim_cancel()`, `llama#fim_accept(mode)`, `llama#statusline()` | facade in `autoload/llama.vim` only |
| p1 | `llama#config#defaults()`, `#load()`, `#current()`, `#reload()`, `#eligibility(bufnr, manual)` | `load` returns `{ok, effective, diagnostics, explicit_keys}` |
| p1 | `llama#stream#new()`, `llama#stream#feed(state, bytes, eof)` | returns `{state, events, diagnostics}` |
| p1 | `llama#render#init/queue/clear/accept/is_repetitive` | owner-scoped by request ID |
| p1 | `llama#request#start/cancel/cancel_all/is_current/snapshot` | one active request per buffer |
| p1 | `llama#request#on_data(id, bytes)`, `#on_error(id, kind, detail)`, `#on_exit(id, result)` | only transport ingress |
| p1 | `llama#request#probe(url, timeout_ms, Callback)` | one bounded GET, no retry, callback once |
| p2 | `llama#context#build(bufnr, position, config)` | returns `{ok, payload, diagnostics}` |
| p2 | `llama#context#remember/add_extra/stats/on_config` | ring and late-chunk cache |
| p2 | `llama#status#start/record/snapshot/show/statusline` | `statusline` is pure |
| p2 | `require('llama.transport').start(spec)`, `.stop(handle)` | Neovim 0.10+ only |
| p2 | `require('llama.buffer').attach/detach/collect_lsp/render/clear` | Neovim 0.10+ only |
| p3 | `scripts/vim/install-llama.sh --install [--mode copy\|link] [--dry-run]`, `--remove [--dry-run]` | owned targets only |

Error kinds: `cancelled`, `timeout`, `transport`, `http_transient` (408, 429, 5xx),
`http_permanent` (other 4xx), `protocol`. On reload and enable, p1 calls
`llama#context#on_config()` and `llama#status#start()` guarded by `exists()`.

### Config keys (`g:llama_config`)

Names follow upstream `llama.vim` where a key already exists there. Repo-profile defaults:

| Key | Default | Rule |
|---|---|---|
| `endpoint_fim` | `http://127.0.0.1:8094/infill` | `http`/`https`; probe URLs are its origin plus `/health`, `/props`, `/v1/models` |
| `model_fim` | `qwen38-220k` | explicit value always wins over discovery |
| `auto_fim` | `v:true` | `v:false` removes auto events; reload to `v:false` cancels pending retries |
| `filetype_exclude` | `[]` | blocks auto-FIM only |
| `path_exclude` | `['*.env', '.env*', '*.pem', '*.key', 'id_rsa*', '*secret*']` | blocks auto, manual and ring storage |
| `n_prefix`, `n_suffix`, `n_predict` | `512`, `64`, `128` | lines, lines, tokens |
| `max_context_bytes` | `32768` | total budget including labels |
| `ring_n_chunks`, `ring_chunk_size`, `ring_per_file_max` | `32`, `64`, `4` | chunks, lines, chunks |
| `debounce_ms`, `render_throttle_ms` | `150`, `16` | |
| `t_connect_ms`, `t_max_predict_ms`, `probe_timeout_ms` | `1000`, `3000`, `1000` | |
| `retry_max_attempts`, `retry_base_ms`, `retry_cap_ms`, `retry_jitter_ms` | `3`, `250`, `2000`, `100` | attempts include the first; `retry_base_ms <= retry_cap_ms` |
| `repeat_max_tokens`, `repeat_max_lines` | `16`, `4` | consecutive identical runs |
| `lsp_enable`, `lsp_deadline_ms` | `v:true`, `150` | |
| `context_callback` | `''` | Funcref or function name for the optional Vim provider |

### Data shapes

- `position` and anchors: `{lnum, col}`, 1-based, `col` as returned by `col('.')`. `opts` of
  `llama#request#start()`: `{anchor: {lnum, col, changedtick}, path, adapter}` with adapter `vim` or `nvim`.
- `llama#request#on_exit(id, result)`: `result` is `{exit_code, http_status}`; `http_status` is `0`
  when the sentinel is missing.
- `llama#request#snapshot(bufnr)`: `{request_id, phase, attempt, text, cancel_reason, last_error}`.
  Without a record: `request_id 0`, phase `idle`, empty text and `last_error {}`. Phases: `idle`,
  `scheduled`, `running`, `streaming`, `retry_wait`, `complete`, `cancelled`, `failed`.
  `last_error` is `{kind, detail, http_status}`.
- `llama#status#snapshot()`: `{state, endpoint, port, model, model_source, n_ctx, ring, last_error,
  diagnostics, updated_at}`. `state` is `unknown`, `probing`, `connected` or `unreachable`;
  `model_source` is `explicit`, `discovered` or `default`; `n_ctx 0` means unknown; `ring` is `{chunks, bytes}`.
- Chunk `source` values: `cursor`, `structure`, `lsp_definition`, `lsp_reference`, `prefix_suffix`,
  `ring`, `callback`.
- FIM capability: a `/v1/models` entry is FIM-capable only when its `capabilities` list contains
  `infill` or `fim`. Everything else is ambiguous and selects nothing. p2 checks this against the
  installed llama.cpp build; if the real field differs, this line and the p4 fixture change in the same commit.
- Auto-FIM triggers are `TextChangedI` and `CursorMovedI` in the plugin augroup, debounced by
  `debounce_ms`, without a `mode()` check, so tests fire them with `doautocmd`.
- Test seam: `g:llama_capability_override`, a Dict such as `{'job': 0, 'textprop': 0}`, read only by
  p1's capability guard. Absent or empty means real `has()` and `executable()` results.

## Risks

- CI runs on `ubuntu-latest`, installs no Vim, and the Ubuntu 24.04 runner image does not list Vim.
  The Vim-backed BATS cases therefore skip in CI and prove behavior only on machines with Vim 9.1.
  Adding Vim to CI would change `.github/workflows/ci.yml` and is outside this change.
- Neovim is not installed on the target workstation. Neovim cases skip there, so p2's Lua modules
  have no local execution evidence until Neovim 0.10+ is available.

## Tasks

### 1. Integrated offline verification

- [ ] Load the package headlessly under Vim 9.1 without personal configuration:

  ```bash
  vim -Nu NONE -i NONE -n -es \
    --cmd "set runtimepath^=$PWD/editor/llama-vim" \
    --cmd "runtime plugin/llama.vim" \
    --cmd "call assert_true(exists(':LlamaReloadConfig'))" \
    --cmd "if !empty(v:errors) | cquit | endif" \
    --cmd "qa!"
  ```

- [ ] Run all focused suites and confirm that no Vim-backed case skipped locally:

  ```bash
  tests/unit/lib/bats-core/bin/bats -r tests/spec/vim-ai-completion/
  bash scripts/openspec-context.sh editor/llama-vim/plugin/llama.vim
  bash scripts/openspec-context.sh scripts/vim/install-llama.sh
  ```

- [ ] When the `qwen38-220k` loadout is started manually on port 8094, run the streaming `/infill`
  smoke test from `docs/dev/llama-vim.md` and record the observed capability fields in
  `editor/llama-vim/UPSTREAM.md`. Live-server availability is not a gate.

### 2. Final verification

- [ ] Run the plan, spec and repository gates. Commit `components/website/src/data/test-inventory.json`
  if `task test:inventory` changes it:

  ```bash
  bash scripts/plan-lint.sh openspec/changes/modernize-llama-vim-integration/tasks.md
  bash scripts/openspec.sh validate
  task test:inventory
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
