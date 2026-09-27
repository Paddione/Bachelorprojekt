-- T900656 p1 — editor capabilities wiring: Treesitter + LSP + Blink (NEW file).
--
-- Exposes M.setup() (wires all three capabilities) plus the per-capability
-- helpers called from the lazy specs in plugins/editor.lua when the plugins
-- actually load.
--
-- No format-on-save and no whitespace cleanup: this module deliberately
-- defines zero BufWritePre autocmds.
--
-- Upstream refs verified live on 2026-09-27 (see plugins/editor.lua header):
-- nvim-treesitter v0.9.3, neovim/nvim-lspconfig v2.9.0, saghen/blink.cmp v1.9.1.

local M = {}

-- Parser list for nvim-treesitter ensure_installed. jsonc is intentionally
-- not a separate parser here: its install requires npm
-- (generate_requires_npm=true), so the jsonc filetype is mapped to the json
-- parser in setup_treesitter() (no strict validation).
local PARSERS = {
  'astro',
  'svelte',
  'javascript',
  'typescript',
  'html',
  'css',
  'json',
  'yaml',
  'markdown',
  'markdown_inline',
  'bash',
  'lua',
  'sql',
  'dockerfile',
}

-- LSP server set. Per-server cmd/root_dir come from the nvim-lspconfig lsp/
-- configs (tag v2.9.0, verified 2026-09-27). No binary installs here — the
-- install path is environment-specific (Linux/WSL: Mason or system package;
-- Windows native: manual).
local SERVERS = {
  'lua_ls',   -- Lua (LuaLS / sumneko)
  'ts_ls',    -- TypeScript & JavaScript (tsserver)
  'astro',    -- Astro
  'svelte',   -- Svelte
  'html',     -- HTML (vscode-html-language-server)
  'cssls',    -- CSS (vscode-css-language-server)
  'jsonls',   -- JSON (vscode-json-language-server)
  'yamlls',   -- YAML (yaml-language-server)
  'marksman', -- Markdown
  'bashls',   -- Bash
}

function M.setup_treesitter()
  local ok, configs = pcall(require, 'nvim-treesitter.configs')
  if not ok then
    vim.notify('editor-capabilities: nvim-treesitter not loaded', vim.log.levels.WARN)
    return
  end
  configs.setup({
    ensure_installed = PARSERS,
    sync_install = false,
    auto_install = true,
    highlight = { enable = true },
    indent = { enable = true },
  })
  -- JSONC: map filetype 'jsonc' to the json parser (core 0.12 API, no
  -- strict validation).
  vim.treesitter.language.register('json', 'jsonc')
end

function M.setup_lsp()
  -- Neovim 0.12: vim.lsp.config resolves the nvim-lspconfig lsp/<server>.lua
  -- configs from runtimepath; vim.lsp.enable(name) auto-activates the config
  -- for its filetypes.
  local legacy_available
  for _, name in ipairs(SERVERS) do
    local cfg = vim.lsp.config[name]
    if cfg then
      -- vim.lsp.config-compatible shim: resolved config plus an explicit
      -- (currently empty) local override point per server.
      vim.lsp.config(name, {})
      pcall(vim.lsp.enable, name)
    else
      -- Fallback for runtimes without vim.lsp.config (pre-0.11):
      -- legacy lspconfig.<server>.setup{}.
      if legacy_available == nil then
        local ok, lspconfig = pcall(require, 'lspconfig')
        legacy_available = ok and lspconfig or nil
      end
      if legacy_available and legacy_available[name] then
        legacy_available[name].setup({})
      else
        vim.notify(
          ('editor-capabilities: LSP config for %s unavailable (no lsp/%s.lua in runtimepath)'):format(name, name),
          vim.log.levels.WARN
        )
      end
    end
  end
end

function M.setup_blink()
  local ok, blink = pcall(require, 'blink.cmp')
  if not ok then
    vim.notify('editor-capabilities: blink.cmp not loaded', vim.log.levels.WARN)
    return
  end
  blink.setup({
    -- Human completion only (LSP/path/snippets/buffer sources by default);
    -- no agent/LLM wiring. Default keymap preset kept — no custom keymap.
    completion = {
      documentation = { auto_show = true },
    },
  })
end

function M.setup()
  M.setup_treesitter()
  M.setup_lsp()
  M.setup_blink()
end

return M
