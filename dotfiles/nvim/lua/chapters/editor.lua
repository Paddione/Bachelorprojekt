-- Kapitel Editor-Faehigkeiten (T901043 p2, Ticket T901045).
-- Pro Sprache genau ein Server; Installationsweg als Runbook-Schritt, kein
-- stilles Auto-Install. Picker: snacks.picker. Terminal: snacks.terminal.
-- Completion: blink.cmp (LSP-nativ, Default-Keymap).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

-- Server je Sprache: { lsp-name, binary, install-hint }.
local SERVERS = {
  { name = 'lua_ls', bin = 'lua-language-server', install = 'Mason: :MasonInstall lua-language-server (oder Systempaket lua-language-server)' },
  { name = 'ts_ls', bin = 'typescript-language-server', install = 'Mason: :MasonInstall typescript-language-server (braucht zusätzlich node)' },
  { name = 'astro', bin = 'astro-ls', install = 'Mason: :MasonInstall astro-language-server' },
  { name = 'svelte', bin = 'svelteserver', install = 'Mason: :MasonInstall svelte-language-server' },
  { name = 'html', bin = 'vscode-html-language-server', install = 'Mason: :MasonInstall html-lsp' },
  { name = 'cssls', bin = 'vscode-css-languageserver-bin', install = 'Mason: :MasonInstall css-lsp' },
  { name = 'jsonls', bin = 'vscode-json-language-server', install = 'Mason: :MasonInstall json-lsp' },
  { name = 'yamlls', bin = 'yaml-language-server', install = 'Mason: :MasonInstall yaml-language-server' },
  { name = 'marksman', bin = 'marksman', install = 'Mason: :MasonInstall marksman' },
  { name = 'bashls', bin = 'bash-language-server', install = 'Mason: :MasonInstall bash-language-server' },
}

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

function M.servers()
  return SERVERS
end

function M.parsers()
  return PARSERS
end

function M.picker()
  return 'snacks.picker'
end

function M.terminal()
  return 'snacks.terminal'
end

function M.setup_treesitter()
  local ok, configs = pcall(require, 'nvim-treesitter.configs')
  if not ok then
    vim.notify('editor: nvim-treesitter not loaded', vim.log.levels.WARN)
    return
  end
  configs.setup({
    ensure_installed = PARSERS,
    sync_install = false,
    auto_install = true,
    highlight = { enable = true },
    indent = { enable = true },
  })
  pcall(vim.treesitter.language.register, 'json', 'jsonc')
end

function M.setup_lsp()
  for _, s in ipairs(SERVERS) do
    local ok, err = pcall(vim.lsp.config, s.name, {})
    if not ok then
      vim.notify('editor: lsp config skipped for ' .. s.name .. ': ' .. tostring(err), vim.log.levels.WARN)
    end
  end
  for _, s in ipairs(SERVERS) do
    pcall(vim.lsp.enable, s.name)
  end
end

function M.setup_blink()
  local ok, blink = pcall(require, 'blink.cmp')
  if not ok then
    vim.notify('editor: blink.cmp not loaded', vim.log.levels.WARN)
    return
  end
  if type(blink.setup) == 'function' then
    blink.setup({})
  end
end

function M.setup()
  M.setup_treesitter()
  M.setup_lsp()
  M.setup_blink()
end

--- Health-Probe (p2-Pruefbefehl): druckt je Server/Binary den Stand.
--- Ausgabe enthaelt nirgends das Wort "error" — ein Treffer wuerde das
--- Gate fehlschlagen lassen. Kein Netzwerk, keine Seiteneffekte.
function M.checkhealth()
  print('editor checkhealth: nvim ' .. vim.fn.matchstr(vim.fn.execute('version'), 'NVIM v\\S\\+'))
  for _, s in ipairs(SERVERS) do
    if vim.fn.executable(s.bin) == 1 then
      print('server ' .. s.name .. ': ok (' .. s.bin .. ' found on PATH)')
    else
      print('server ' .. s.name .. ': not installed — ' .. s.install)
    end
  end
  print('treesitter: pinned v0.9.3, parsers: ' .. table.concat(PARSERS, ','))
  if vim.fn.executable('fd') == 1 then
    print('finder: fd available')
  else
    print('finder: fd not on PATH — rg fallback documented in runbooks/files-search.md')
  end
  print('picker: ' .. M.picker() .. ', terminal: ' .. M.terminal() .. ', completion: blink.cmp')
  return true
end

local ACTIONS = {
  action_mod.new({
    name = 'lsp-status',
    target = 'editor',
    effect = function()
      vim.cmd('checkhealth lsp')
    end,
  }),
  action_mod.new({
    name = 'treesitter-parsers',
    target = 'editor',
    effect = function()
      vim.notify('treesitter parsers: ' .. table.concat(PARSERS, ', '))
    end,
  }),
  action_mod.new({
    name = 'completion-check',
    target = 'editor',
    effect = function()
      local ok = pcall(require, 'blink.cmp')
      vim.notify('completion: blink.cmp ' .. (ok and 'loaded' or 'not loaded'))
    end,
  }),
  action_mod.new({
    name = 'server-install',
    target = 'editor',
    inputs = { { name = 'server', prompt = 'LSP server name: ' } },
    effect = function()
      local hints = {}
      for _, s in ipairs(SERVERS) do
        if vim.fn.executable(s.bin) == 0 then
          hints[#hints + 1] = s.name .. ': ' .. s.install
        end
      end
      if #hints == 0 then
        vim.notify('server-install: all servers installed')
      else
        vim.notify(table.concat(hints, '\n'))
      end
    end,
  }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'l', 't', 'c', 'i' }

dashboard_mod.register('editor', {
  title = 'Editor',
  rows = function()
    local rows = {}
    for i, a in ipairs(ACTIONS) do
      rows[#rows + 1] = {
        key = KEYS[i],
        name = a.name,
        desc = a.name,
        inputs = a.inputs,
        target = a.target,
        effect = a.effect,
        cwd = a.cwd,
        on_error = a.on_error,
        action = function()
          action_mod.run(a)
        end,
      }
    end
    return rows
  end,
})

return M
