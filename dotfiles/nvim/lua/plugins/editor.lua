-- Editor-Faehigkeiten: Treesitter, LSP, Completion (T901043 p2).
--
-- Upstream-Pins live re-verifiziert am 2026-10-08 (git ls-remote tags):
--   nvim-treesitter  v0.9.3  (annotated tag 13be7a02, peeled cfc6f2c1)
--     README: Neovim 0.9.2+ (Ziel hier: v0.12.5). jsonc-Parser braucht npm
--     (generate_requires_npm=true) — jsonc wird auf den json-Parser gemappt.
--   neovim/nvim-lspconfig  v2.9.0  (Tag f6738ef6)
--     Legacy require('lspconfig') deprecated; Configs liegen in lsp/ und
--     loesen ueber vim.lsp.config auf (Nvim 0.11+). lsp/ enthaelt u.a.:
--     astro, svelte, html, cssls, jsonls, yamlls, marksman, bashls,
--     lua_ls, ts_ls.
--   saghen/blink.cmp  v1.9.1  (Tag fb59cdef, peeled 4b18c32a)
--     "works out of the box", LSP-nativ; Default-Keymap, keine Custom-Maps.
--
-- Keine Ueberlappung mit plugins/core.lua: Snacks/Trouble/which-key liefern
-- Suche, Diagnose und UI — kein Parsing, keine Server, keine Completion.
-- Keine Server-Binaerinstalls durch diese Config: Installationswege stehen
-- als Runbook-Schritte (runbooks/editor.md), fehlende Server melden sich
-- als Health-Hinweis, nicht als stilles Auto-Install.
return {
  {
    'nvim-treesitter/nvim-treesitter',
    version = 'v0.9.3',
    build = ':TSUpdate',
    event = { 'BufReadPre', 'BufNewFile' },
    config = function()
      require('chapters.editor').setup_treesitter()
    end,
  },
  {
    'neovim/nvim-lspconfig',
    version = 'v2.9.0',
    event = 'BufReadPre',
    config = function()
      require('chapters.editor').setup_lsp()
    end,
  },
  {
    'saghen/blink.cmp',
    version = 'v1.9.1',
    event = 'VeryLazy',
    config = function()
      require('chapters.editor').setup_blink()
    end,
  },
}
