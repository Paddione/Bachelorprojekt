## Task p1: Editor capabilities implementation (Treesitter, LSP, Blink)

Context. This partial implements ticket T900656 (Neovim editor capabilities) for change `nvim-editor-capabilities`. It owns exactly two NEW files and creates no other file. Target Neovim is v0.12.5 at `/usr/local/bin/nvim` with lazy.nvim stable bootstrap from the foundation (T900655). The existing `config/editor.lua` shared defaults and `plugins/core.lua` thirteen kept plugins stay untouched. The old host config at `~/.config/nvim.old-20260927` is read-only reference for candidate comparison only. Upstream compatibility must be verified live against plugin docs with source and date recorded in the runbook follow-up (p2), not from memory.

Target files (all NEW):

- `dotfiles/nvim/lua/plugins/editor.lua` (editor plugin specs: nvim-treesitter, nvim-lspconfig, blink.cmp minimal specs on lazy stable)
- `dotfiles/nvim/lua/config/editor-capabilities.lua` (capability module exposing `M.setup()` wiring treesitter + LSP + blink, no format-on-save)

### Steps

1. Inventory overlap against the thirteen kept plugins (`plugins/core.lua`): Snacks, Telescope, Trouble, which-key provide search/diagnostics/UI only and do not provide parsing, language servers, or completion. Record the no-overlap finding as a code comment header in `plugins/editor.lua`.
2. Verify candidates live: check `nvim-treesitter` branch/tag compatibility with Neovim 0.12, `neovim/nvim-lspconfig` server configs needed (lua_ls, ts_ls or tsserver, astro, svelte, html, cssls, jsonls, yamlls, marksman or marksman-equivalent, bashls), and `saghen/blink.cmp` version pin compatible with 0.12. Record chosen refs as comments with verification date. Do not install language-server binaries in this partial; configure install paths per environment (Linux/WSL via Mason or system package, Windows native noted as manual) without executing installs.
3. Create `dotfiles/nvim/lua/plugins/editor.lua` returning the lazy spec list with exactly three plugin groups: treesitter (with `build = ":TSUpdate"` guarded, `opts.ensure_installed` covering astro, svelte, javascript, typescript, html, css, json, jsonc treated via json parser, yaml, markdown, markdown_inline, bash, lua, sql, dockerfile), lspconfig (with per-server `opts.servers` table and mason-independent `cmd` notes), blink.cmp (human completion only, no agent wiring, default keymap preserved). All specs lazy-load on `VeryLazy` or `BufReadPre` and must not reference `config.dashboard` or any chapter module.
4. Create `dotfiles/nvim/lua/config/editor-capabilities.lua` as a module returning `M` with `M.setup()`: call treesitter setup with highlight and indent enabled and the parser list above; configure lspconfig servers with `vim.lsp.config`-compatible shims only where supported by 0.12 (fallback to `lspconfig.<server>.setup{}` otherwise); set blink.cmp with default keymap and documentation popup; enforce no format-on-save and no whitespace cleanup (assert by absence: no `BufWritePre` autocmd in this module). Handle JSONC by filetype mapping `jsonc` to `json` parser without strict validation.
5. Prove headless module load without network: stage the repo config to a temp dir and run a Lua probe with `package.path` pointed at staged `lua/` requiring `config.editor-capabilities` and `plugins.editor` shape check (each spec has a non-empty repo string). Then run full headless startup `nvim --headless -u "$STAGE/init.lua" -i NONE +qa` after wiring `require("config.editor-capabilities").setup()` behind a guarded `pcall` in a LOCAL test copy of init (do not modify the committed `init.lua`; the wiring lands via the `plugins.editor` import through lazy). Keep the real `init.lua` untouched in this partial.
6. Stage exactly the two touched paths and commit with the ticket-scoped conventional subject:
   ```bash
   git add dotfiles/nvim/lua/plugins/editor.lua dotfiles/nvim/lua/config/editor-capabilities.lua
   git commit -m "feat(T900656): treesitter lsp blink editor capabilities [T900656]"
   ```

### Acceptance criteria

- `dotfiles/nvim/lua/plugins/editor.lua` exists with exactly the three plugin groups and the parser list above; no other plugin enters the set.
- `dotfiles/nvim/lua/config/editor-capabilities.lua` exists exposing `M.setup()` with treesitter highlight plus indent, per-server LSP table, blink defaults, JSONC mapping, and zero `BufWritePre` autocmds.
- Headless Lua probe loads both modules without network; full startup exits zero.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
