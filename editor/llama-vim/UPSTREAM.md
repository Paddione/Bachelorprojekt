# UPSTREAM.md — Provenance and Synchronization Contract

## Imported Source Identity

- **Upstream Project:** [llama.cpp](https://github.com/ggerganov/llama.cpp)
- **Source File:** `examples/llama.vim`
- **Import Date:** 2026-09-11
- **Inspected Revision SHA-256:** `85c627410e04cfdaa0ae6886214dfa98e976244be914fcf9ab5719360594439d` (783 lines)
- **Verified External Checkout Paths:**
  - `~/.unsloth/llama.cpp/examples/llama.vim`
  - `~/opt/llama.cpp-src/examples/llama.vim`

Both external checkout copies were verified to be byte-identical prior to import. Neither external checkout tree is mutated during installation, execution, or removal.

## Architecture and Divergence Summary

The repository-owned `editor/llama-vim` integration replaces the original single-file example script with a modular, maintainable architecture:

1. **E746-Compliant Public Facade (`autoload/llama.vim`):** Replaces monolithic global functions with explicit autoloaded entry points (`llama#fim`, `llama#fim_cancel`, `llama#fim_accept`, `llama#statusline`).
2. **Per-Buffer Request State Machine (`autoload/llama/request.vim`):** Assigns unique monotonic request IDs, enforces single-active-request-per-buffer guarantees, handles cancellation, HTTP status classification, and bounded retry with backoff.
3. **Incremental Framing Parser (`autoload/llama/stream.vim`):** Replaces naive buffer chunking with an incremental framing parser supporting SSE, NDJSON, and non-streaming JSON responses across arbitrary TCP/callback boundaries.
4. **Owner-Scoped Ghost Text Renderer (`autoload/llama/render.vim`):** Manages text properties and Neovim extmarks scoped by request ID, with render coalescing and a token/line repetition guard.
5. **Language-Aware Context Assembly (`autoload/llama/context.vim`):** Provides enclosing function/class discovery, LSP definition/reference ranking, sensitive file exclusions (`.env`, keys), and a bounded file-keyed ring buffer.
6. **Async Endpoint Discovery & Observable Health (`autoload/llama/status.vim`):** Performs non-blocking health and model probes without delaying editor startup or executing server-management commands.
7. **Native Neovim Adapters (`lua/llama/buffer.lua`, `lua/llama/transport.lua`):** Provides native `vim.system` transport and extmark rendering on Neovim 0.10+.

## Synchronization Procedure

To synchronize with a new upstream release of `examples/llama.vim`:

1. Fetch and review the upstream commit in its separate checkout.
2. Generate a reviewed diff against the recorded SHA-256 revision: `85c62741...`.
3. Port relevant bug fixes or features into the corresponding modular components under `editor/llama-vim/`.
4. Run the full BATS verification suite: `tests/unit/lib/bats-core/bin/bats -r tests/spec/vim-ai-completion/`.
5. Update the recorded revision, date, and SHA-256 hash in this file in the same commit.
