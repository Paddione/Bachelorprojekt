-- T900656 p1 — editor capabilities: Treesitter, LSP, Blink (NEW file).
--
-- No overlap with the thirteen kept core plugins (plugins/core.lua):
-- Snacks, Telescope, Trouble and which-key provide search, diagnostics and
-- UI only — none of them provides parsing (Treesitter), language servers
-- (LSP) or completion. This spec list is the sole source of those three
-- capabilities in this config.
--
-- Upstream refs verified live on 2026-09-27 (git ls-remote tags + README/docs):
--   nvim-treesitter  v0.9.3  tag 13be7a022997446bf96892bf1ac95784681a02e1
--     (annotated tag; peeled commit cfc6f2c117aaaa82f19bcce44deec2c194d900ab)
--     README (v0.9.3): Neovim 0.9.2+ (target here: v0.12.5). The jsonc parser
--     ships as a separate parser requiring npm (generate_requires_npm=true),
--     so jsonc is handled via the json parser instead — filetype mapping in
--     config/editor-capabilities.lua.
--   neovim/nvim-lspconfig  v2.9.0  tag f6738ef65dabade340b473d4ff2a1ad3352c10e7
--     README (v2.9.0): legacy require('lspconfig') deprecated; configs live in
--     lsp/ and resolve through vim.lsp.config (Nvim 0.11+). lsp/ verified by
--     checkout of tag v2.9.0 to contain: astro, svelte, html, cssls, jsonls,
--     yamlls, marksman, bashls, lua_ls, ts_ls.
--   saghen/blink.cmp  v1.9.1  tag fb59cdefc31cb043bb49af5a6dacdca9476c2b38
--     (annotated tag; peeled commit 4b18c32adef2898f95cdef6192cbd5796c1a332d)
--     README/docs: "works out of the box", LSP support; the default keymap
--     preset is kept (no custom keymap), human completion only. Entry module
--     is blink.cmp (lua/blink-cmp.lua re-exports it), not blink.
--
-- No language-server binaries are installed by this config: server install is
-- environment-specific (Linux/WSL: Mason or system package; Windows native:
-- manual). Missing servers surface as LSP health warnings, not as installs.
--
-- Lazy loading: BufReadPre for parsing/LSP, VeryLazy for completion.
-- This file must not reference config.dashboard or any chapter module.

return {
  {
    'nvim-treesitter/nvim-treesitter',
    version = 'v0.9.3',
    -- Guarded: lazy.nvim runs the build only at install/update time.
    build = ':TSUpdate',
    event = { 'BufReadPre', 'BufNewFile' },
    config = function()
      require('config.editor-capabilities').setup_treesitter()
    end,
  },
  {
    'neovim/nvim-lspconfig',
    version = 'v2.9.0',
    event = 'BufReadPre',
    config = function()
      require('config.editor-capabilities').setup_lsp()
    end,
  },
  {
    'saghen/blink.cmp',
    version = 'v1.9.1',
    event = 'VeryLazy',
    config = function()
      require('config.editor-capabilities').setup_blink()
    end,
  },
}
