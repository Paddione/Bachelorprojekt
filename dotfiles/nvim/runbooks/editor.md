---
page: editor
ticket: T900656
status: complete
actions:
  - status
  - parsers-install
  - lsp-install
  - completion-check
---

## Voraussetzungen

- Neovim v0.12.5 (verified target; LSP wiring requires Nvim 0.11+ for the
  `vim.lsp.config` resolver).
- The repo config is installed via `dotfiles/install.sh` into
  `~/.config/nvim`, including the p1 capability modules
  `lua/plugins/editor.lua` and `lua/config/editor-capabilities.lua`
  (commit 3619a4a31 on `feature/nvim-editor-T900656`).
- Network access for the first `parsers-install` step (parser downloads)
  and for lazy.nvim to install the three plugins on first startup.
- Language-server binaries are **not** installed by this config — see
  per-environment paths under Troubleshooting.

## Geordnete Schritte

1. **Status** — Start Neovim and verify the editor capability plugins are
   present: `:Lazy` must list nvim-treesitter, nvim-lspconfig and
   blink.cmp; `:scriptnames` must include `lua/plugins/editor.lua`.
2. **Parsers-Install** — Install the treesitter parsers listed in
   `config/editor-capabilities.lua` (astro, svelte, javascript,
   typescript, html, css, json, yaml, markdown, markdown_inline, bash,
   lua, sql, dockerfile) with `:TSInstallSync` or let `ensure_installed`
   fetch them on first load. JSONC is mapped to the json parser
   (`vim.treesitter.language.register('json', 'jsonc')`) — the separate
   jsonc parser needs npm and is intentionally not used.
3. **LSP-Install** — Enable the language servers from the SERVERS table
   (lua_ls, ts_ls, astro, svelte, html, cssls, jsonls, yamlls, marksman,
   bashls) via the `vim.lsp.config` shim (`vim.lsp.enable(name)`), which
   resolves the nvim-lspconfig `lsp/<server>.lua` configs from the
   runtimepath. This config performs **no binary installs**; provide each
   server binary per environment (see Troubleshooting).
4. **Completion-Check** — Type in a file with an active LSP client
   (e.g. Lua): blink.cmp must show completion with its default keymap
   (human-only sources; no agent/LLM wiring) and its documentation window
   on selection. There is deliberately **no format-on-save**: the
   capability modules register zero `BufWritePre` autocmds.

## Erwartetes Ergebnis

- Headless startup exits 0; `:Lazy` shows the three editor plugins
  installed and pinned (treesitter v0.9.3, lspconfig v2.9.0, blink.cmp
  v1.9.1).
- Parsing, diagnostics and completion work on supported filetypes; JSONC
  files highlight via the json parser.
- Health check is clean except for servers whose binary is absent:
  `:checkhealth nvim-treesitter lsp blink`

## Troubleshooting

- **Parser not installed / no highlighting.** Check `:TSInstallInfo`;
  ensure a C toolchain (`cc`, `make`) is present for parser compilation.
- **Server not starting.** `:LspInfo` shows why; then install the binary
  per environment:
  - Linux/WSL: `mason` (`:Mason` → install the named server) or the
    system package manager (e.g. `apt install lua-language-server`).
  - Windows native: install manually (no package manager assumed) and put
    the executable on `PATH`.
- **No completion popup.** `:checkhealth blink` first; blink.cmp needs an
  LSP client (or buffer/path source) to produce items.
- **`editor-capabilities: LSP config for X unavailable` in
  :messages.** The nvim-lspconfig `lsp/X.lua` file is missing from the
  runtimepath (plugin not loaded) — run `:Lazy install nvim-lspconfig`.

## Recovery

- Remove a plugin (blink.cmp example):
  `:Lazy remove blink.cmp` — then delete its spec from
  `lua/plugins/editor.lua` and its wiring call from
  `M.setup_blink()` in `lua/config/editor-capabilities.lua`.
- Remove the whole capability set: uninstall the three plugins via
  `:Lazy`, delete `lua/plugins/editor.lua` and
  `lua/config/editor-capabilities.lua`, and drop the
  `{ import = 'plugins.editor' }` entry from `init.lua`.
- Roll back to the preserved prior config if the editor becomes broken:
  `mv ~/.config/nvim.old-20260927 ~/.config/nvim`.

## Quellen (Stand 2026-09-27, verifiziert live)

- nvim-treesitter v0.9.3 — tag 13be7a022997446bf96892bf1ac95784681a02e1
  (annotated tag; peeled commit cfc6f2c117aaaa82f19bcce44deec2c194d900ab).
- neovim/nvim-lspconfig v2.9.0 — tag
  f6738ef65dabade340b473d4ff2a1ad3352c10e7; configs live in `lsp/` and
  resolve through `vim.lsp.config` (Nvim 0.11+); legacy
  `require('lspconfig')` is deprecated (v3.0.0 removal).
- saghen/blink.cmp v1.9.1 — tag
  fb59cdefc31cb043bb49af5a6dacdca9476c2b38 (annotated tag; peeled commit
  4b18c32adef2898f95cdef6192cbd5796c1a332d); entry module is `blink.cmp`.