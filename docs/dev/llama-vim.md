# Developer & Operator Guide: llama.vim Integration

This guide details the internal operation, troubleshooting procedures, verification steps, and rollback options for the `llama.vim` FIM editor integration.

## Architecture & Component Map

The integration source lives in `editor/llama-vim/`:

- `plugin/llama.vim`: Plugin entry point, command definitions, capability guards, and autocommand management.
- `autoload/llama.vim`: E746-compliant public facade (`llama#fim`, `llama#fim_cancel`, `llama#fim_accept`, `llama#statusline`).
- `autoload/llama/config.vim`: Schema validation, defaults, typo detection, and transactional reload.
- `autoload/llama/request.vim`: Request ID state machine, Vim job/curl transport, cancellation, and retry policy.
- `autoload/llama/stream.vim`: Incremental SSE/NDJSON/JSON framing parser.
- `autoload/llama/render.vim`: Text property ghost text rendering, coalescing, and repetition guard.
- `autoload/llama/context.vim`: Structural context providers, LSP definition/reference ranking, sensitive file exclusions, and file-keyed ring buffer.
- `autoload/llama/status.vim`: Async health/model probes and statusline formatting.
- `lua/llama/buffer.lua`: Neovim extmark rendering and LSP enrichment.
- `lua/llama/transport.lua`: Neovim `vim.system` transport adapter.
- `scripts/vim/install-llama.sh`: Idempotent installer script.

## Installation & Lifecycle Management

```bash
# Preview installation (zero-write dry run)
bash scripts/vim/install-llama.sh --install --dry-run

# Execute installation
bash scripts/vim/install-llama.sh --install

# Install in link mode
bash scripts/vim/install-llama.sh --install --mode link

# Execute removal and restore configuration
bash scripts/vim/install-llama.sh --remove
```

## Verification & Testing

Run the full offline BATS test suite:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/vim-ai-completion/
```

Individual test files:
- `tests/spec/vim-ai-completion/request-stream.bats`
- `tests/spec/vim-ai-completion/install-config.bats`
- `tests/spec/vim-ai-completion/context-status.bats`

Headless Vim verification:

```bash
vim -Nu NONE -i NONE -n -es \
  --cmd "set runtimepath^=$PWD/editor/llama-vim" \
  --cmd "runtime plugin/llama.vim" \
  --cmd "call assert_true(exists(':LlamaReloadConfig'))" \
  --cmd "qa!"
```

## Troubleshooting & Common Failure Modes

### 1. Unsupported Editor Capabilities
- **Symptom:** `:LlamaEnable` reports missing features or registers no autocmds.
- **Cause:** Vim compiled without `+job`, `+timers`, `+textprop`, or `+channel`, or `curl` not in `$PATH`.
- **Resolution:** Verify features with `vim --version` and install `curl`.

### 2. Unreachable Endpoint / Port 8094 Offline
- **Symptom:** Status shows `unreachable`.
- **Cause:** No server process running on `http://127.0.0.1:8094/infill`.
- **Resolution:** Startup remains responsive. Start local server loadout (e.g. `qwen38-220k` on port 8094) when ready.

### 3. Excluded Filetypes or Sensitive Buffers
- **Symptom:** No auto-completion in `.env` files or markdown buffers.
- **Cause:** `path_exclude` or `filetype_exclude` rules.
- **Resolution:** Manual completion `:LlamaFim` remains available for excluded filetypes, but sensitive path exclusions remain fail-closed.
