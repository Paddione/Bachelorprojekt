---
title: "modernize-llama-vim-integration — Implementation Plan"
ticket_id: T900141
domains: [vim, llm-local-dev]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# modernize-llama-vim-integration — Implementation Plan

_Ticket: T900141_

## File Structure

```text
editor/llama-vim/README.md
editor/llama-vim/UPSTREAM.md
editor/llama-vim/plugin/llama.vim
editor/llama-vim/autoload/llama/config.vim
editor/llama-vim/autoload/llama/context.vim
editor/llama-vim/autoload/llama/render.vim
editor/llama-vim/autoload/llama/request.vim
editor/llama-vim/autoload/llama/status.vim
editor/llama-vim/autoload/llama/stream.vim
editor/llama-vim/lua/llama/buffer.lua
editor/llama-vim/lua/llama/transport.lua
scripts/vim/install-llama.sh
tests/fixtures/llama-vim/fake-server.mjs
tests/spec/vim-ai-completion/install-config.bats
tests/spec/vim-ai-completion/request-stream.bats
tests/spec/vim-ai-completion/context-status.bats
docs/dev/llama-vim.md
openspec/component-map.yaml
```

## 1. RED baseline and package ownership

- [ ] 1.1 Add `tests/fixtures/llama-vim/fake-server.mjs` and the failing lifecycle/stream cases in `tests/spec/vim-ai-completion/request-stream.bats` for split SSE, split NDJSON, late callbacks, cancellation, repetition, 400, 429 and 503; run `tests/unit/lib/bats-core/bin/bats tests/spec/vim-ai-completion/request-stream.bats` and record `expected: FAIL` before implementation.
- [ ] 1.2 Add failing install, idempotency, backup, removal, schema-typo, excluded-filetype and hot-reload cases in `tests/spec/vim-ai-completion/install-config.bats`; verify the focused BATS file fails because `scripts/vim/install-llama.sh` and the package do not yet exist.
- [ ] 1.3 Add failing context, multi-buffer, sensitivity, discovery, offline-startup and side-effect-free statusline cases in `tests/spec/vim-ai-completion/context-status.bats`; verify the focused BATS file fails while leaving the real home directory and ports untouched.

## 2. Package, configuration and reversible installation

- [ ] 2.1 Create the guarded public command/autocommand surface in `editor/llama-vim/plugin/llama.vim` and the layered schema/default implementation in `editor/llama-vim/autoload/llama/config.vim`; verify headless Vim rejects unknown keys with a nearest-key suggestion and loads the documented port-8094 profile.
- [ ] 2.2 Implement idempotent install, dry-run and remove modes in `scripts/vim/install-llama.sh`; verify `tests/spec/vim-ai-completion/install-config.bats` passes against an isolated temporary HOME and proves backup/restoration without changing the real `~/.vimrc`.
- [ ] 2.3 Implement config-diff application and `:LlamaReloadConfig` wiring across `editor/llama-vim/plugin/llama.vim` and `editor/llama-vim/autoload/llama/config.vim`; verify changing exclusions and debounce values replaces only plugin-owned autocommands/timers and creates no duplicate registrations.

## 3. Race-safe request lifecycle and editor adapters

- [ ] 3.1 Implement the immutable payload builder and per-buffer request-ID state machine in `editor/llama-vim/autoload/llama/request.vim`; verify deterministic tests show that superseded IDs, changed ticks and late exit events cannot update current state.
- [ ] 3.2 Add the Vim 9.1 raw-job transport, stop handling and normalized event callbacks in `editor/llama-vim/autoload/llama/request.vim`; verify headless Vim can stream from the fixture, cancel the job and finish with no leaked timer or callback error.
- [ ] 3.3 Add the optional Neovim 0.10+ `vim.system` adapter in `editor/llama-vim/lua/llama/transport.lua` and buffer invalidation in `editor/llama-vim/lua/llama/buffer.lua`; verify Neovim tests pass when 0.10+ is installed and otherwise report an explicit skip while Vim tests remain green.

## 4. Streaming, ghost text and recovery

- [ ] 4.1 Implement the pure incremental SSE/NDJSON/final-JSON parser in `editor/llama-vim/autoload/llama/stream.vim`; verify split records, multi-line SSE data, `[DONE]`, malformed data and arbitrary callback boundaries in `tests/spec/vim-ai-completion/request-stream.bats`.
- [ ] 4.2 Implement throttled text-property/extmark ghost rendering, explicit acceptance and repetition detection in `editor/llama-vim/autoload/llama/render.vim`; verify first content renders before process exit, no real buffer text changes before acceptance, and a repeated stream is cancelled.
- [ ] 4.3 Add curl exit/HTTP classification and bounded exponential retry with jitter in `editor/llama-vim/autoload/llama/request.vim`; verify 429/503 and timeout retry within configured limits, 400 never retries, and disable/reload cancels retry timers.

## 5. Context selection and multi-window behavior

- [ ] 5.1 Implement canonical-path ring entries, SHA-256 deduplication, per-file/total eviction and sensitive-buffer eligibility in `editor/llama-vim/autoload/llama/context.vim`; verify two windows retain independent requests while safe chunks are reused and secret-like buffers are never stored or sent.
- [ ] 5.2 Add budgeted enclosing-structure providers and bounded prefix/suffix fallback in `editor/llama-vim/autoload/llama/context.vim`; verify representative Astro/Svelte, TypeScript/JavaScript, Python/Ruby, Lua and shell fixtures keep signatures/boundaries when possible and never exceed configured budgets.
- [ ] 5.3 Add deadline-bounded Neovim LSP definition/reference enrichment in `editor/llama-vim/lua/llama/buffer.lua` plus the optional Vim context callback contract in `editor/llama-vim/autoload/llama/context.vim`; verify LSP chunks rank ahead of ordinary ring chunks and missing/late providers fall back without delaying FIM.

## 6. Discovery, health and operator feedback

- [ ] 6.1 Implement asynchronous `/health`, `/props` and `/v1/models` discovery with explicit-value precedence in `editor/llama-vim/autoload/llama/status.vim`; verify an offline endpoint is non-blocking, ambiguous capability metadata does not guess, and a positively FIM-capable candidate is selected deterministically.
- [ ] 6.2 Implement structured last-error/status snapshots, `:LlamaStatus` and the side-effect-free `llama#statusline()` function in `editor/llama-vim/autoload/llama/status.vim`; verify repeated statusline evaluation performs no HTTP/job action and displays connection, port, model, context and ring fields when known.

## 7. Documentation and repository routing

- [ ] 7.1 Write `editor/llama-vim/README.md` and `docs/dev/llama-vim.md` with requirements, safe install/remove, explicit Vim configuration, Neovim optional behavior, manual server start, `/infill` smoke test, statusline usage, filetype exclusions, hot reload and rollback; verify every command is copyable and no step implies automatic deployment or model switching.
- [ ] 7.2 Record the imported source URL, revision/hash and sync procedure in `editor/llama-vim/UPSTREAM.md`, and map `editor/llama-vim` plus `scripts/vim` to `vim-ai-completion` in `openspec/component-map.yaml`; verify source provenance matches the inspected example hash and `bash scripts/openspec-context.sh editor/llama-vim/plugin/llama.vim` resolves the new capability.

## 8. Integrated verification

- [ ] 8.1 Run `vim -Nu NONE -n -es` smoke scripts plus all BATS files under `tests/spec/vim-ai-completion/`; when port 8094 is manually available, run the documented streaming `/infill` smoke test and record observed capability fields without making live-server availability an offline gate.
- [ ] 8.2 Run `bash scripts/plan-lint.sh openspec/changes/modernize-llama-vim-integration/tasks.md`, `bash scripts/openspec.sh validate`, `task test:changed`, `task freshness:regenerate`, `task freshness:check` and `task workspace:validate`; verify every mandatory gate passes and generated artifacts contain only expected changes.
