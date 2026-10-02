-- lua/config/nodectl.lua — node-control layer for the bare-metal Ubuntu host (PK-Desktop).
--
-- Drop-in module: no dependency is required at load time. Everything that needs
-- a plugin (snacks, which-key, kubectl.nvim, telescope, toggleterm) is guarded
-- with pcall, so this file is safe to `require` from headless checks.
--
-- Integration (see ../README.md):
--   1. copy this file to ~/.config/nvim/lua/config/nodectl.lua
--   2. copy ../plugins/nodectl.lua to ~/.config/nvim/lua/plugins/nodectl.lua
--   3. copy ../../SETUP_CHECKLIST.md to ~/.config/nvim/SETUP_CHECKLIST.md
--   4. add `{ import = 'plugins.nodectl' },` to the lazy.setup() spec table in
--      init.lua and call `require('config.nodectl').setup()` at startup.
--   5. wire the `infrastructure-node` page in lua/config/dashboard.lua:
--      link `n` on the Infrastructure page + the page's flat rows from
--      `require('config.nodectl').node_rows(...)`.
local M = {}

--- Path of the checklist shown on the dashboard first view.
--- On native Windows the checklist lives in the mirrored WSL cache (the
--- wrapper dir %LOCALAPPDATA%\nvim itself only holds the wrapper init.lua).
M.checklist_path = (vim.fn.has('win32') == 1 and vim.g.wsl_config_cache)
    and (vim.g.wsl_config_cache .. '/SETUP_CHECKLIST.md')
  or (vim.fn.stdpath('config') .. '/SETUP_CHECKLIST.md')

--- Last async probe results. Keys: contexts (map), node_ready (true/false/nil).
M.status = { contexts = {}, node_ready = nil, probed_at = 0 }

--- Windows boundary (native nvim.exe on the Windows side).
--- The Windows wrapper (%LOCALAPPDATA%\nvim\init.lua) mirrors this file from
--- WSL via robocopy, so Linux-only operations must be routed back into the
--- distro explicitly — never by copying Linux paths/shell assumptions wholesale:
---   wsl.exe --distribution <name> --cd <Linux-root> -- <cmd>
--- Windows facts (verified 2026-09-17, native nvim.exe headless):
---   native kubectl knows fleet/hetzner only (no devmesh context);
---   k9s/lazygit are NOT installed on Windows; ~/Bachelorprojekt on Windows is
---   an empty placeholder repo (only .git, no commits) — the real checkout is
---   reachable via UNC. Vim's global shell is never changed; only project
---   commands take this scoped boundary.
M.is_win = vim.fn.has('win32') == 1
M.wsl_distro = 'k3d-dev' -- mirrors the wrapper UNC host; keep in sync with it
M.linux_root = '/home/patrick/Bachelorprojekt' -- WSL fallback; detect via `git rev-parse` there
M.win_unc_root = '\\\\wsl.localhost\\k3d-dev\\home\\patrick\\Bachelorprojekt'

--- Repo root for pickers/terminals: first existing dir wins, nil = cwd.
--- On Windows the UNC checkout wins; the empty ~/Bachelorprojekt placeholder
--- is only a fallback so nothing silently runs against the last project.
function M.repo_root()
  if M.is_win and vim.fn.isdirectory(M.win_unc_root) == 1 then return M.win_unc_root end
  local home_repo = vim.fn.expand('~/Bachelorprojekt')
  if vim.fn.isdirectory(home_repo) == 1 then return home_repo end
  return nil
end

--- Prefix a Linux-only command with the WSL boundary on native Windows.
--- Pass-through on Linux/WSL, so Linux behavior is byte-identical.
function M.wsl_wrap(cmd)
  if not M.is_win then return cmd end
  local wrapped = { 'wsl.exe', '--distribution', M.wsl_distro, '--cd', M.linux_root, '--' }
  for _, a in ipairs(cmd) do wrapped[#wrapped + 1] = a end
  return wrapped
end

local function has_plugin(name)
  local ok, _ = pcall(require, name)
  return ok
end

--- Synchronous binary probes (no network, no blocking). Returns ordered rows:
--- { name = string, ok = boolean, hint = string }
function M.probe_bins()
  local rows = {}
  local function row(name, hint)
    rows[#rows + 1] = { name = name, ok = vim.fn.executable(name) == 1, hint = hint or '' }
  end
  row('kubectl', 'steuert fleet + devmesh')
  row('k9s', 'interaktive Cluster-Ansicht (Toggleterm)')
  row('lazygit', 'git-UI für das Bachelorprojekt-Repo')
  row('tailscale', 'braucht scripts/devmesh/tailnet-check.sh')
  row('helm', 'devmesh:deploy braucht helm repo add')
  return rows
end

--- Parse SETUP_CHECKLIST.md into { done = bool, text = string, lnum = int }.
function M.parse_checklist(path)
  path = path or M.checklist_path
  local items = {}
  local fd = io.open(path, 'r')
  if not fd then return items end
  local lnum = 0
  for line in fd:lines() do
    lnum = lnum + 1
    local mark, text = line:match('^%s*-%s+%[([ xX])%]%s+(.+)$')
    if mark and text then
      items[#items + 1] = { done = mark:lower() == 'x', text = text, lnum = lnum }
    end
  end
  fd:close()
  return items
end

function M.open_checklist()
  vim.cmd('edit ' .. vim.fn.fnameescape(M.checklist_path))
end

--- Async cluster probes. Never throws; calls cb() on the main loop when done.
--- Mirrors the llm.dashboard_probe pattern: results land in M.status, the
--- caller refreshes the dashboard via Snacks.dashboard.update().
function M.probe_async(cb)
  cb = cb or function() end
  local pending = 2
  local function done()
    pending = pending - 1
    if pending <= 0 then
      M.status.probed_at = os.time()
      vim.schedule(cb)
    end
  end
  -- 1. which kubeconfig contexts exist (WSL-routed on Windows: native
  -- kubectl has no devmesh context, so badges would lie without this)
  vim.system(M.wsl_wrap({ 'kubectl', 'config', 'get-contexts', '-o', 'name' }), { text = true }, function(res)
    local have = {}
    if res and res.code == 0 and res.stdout then
      for line in res.stdout:gmatch('[^\r\n]+') do
        have[vim.trim(line)] = true
      end
    end
    M.status.contexts = have
    done()
  end)
  -- 2. is the offline agent back? (gpu-cluster-3, 10.10.10.4; WSL-routed on
  -- Windows — the devmesh context only exists inside the distro)
  vim.system(
    M.wsl_wrap({ 'kubectl', '--context', 'devmesh', 'get', 'node', 'gpu-cluster-3',
      '-o', 'jsonpath={.status.conditions[?(@.type=="Ready")].status}' }),
    { text = true },
    function(res)
      if res and res.code == 0 and res.stdout then
        M.status.node_ready = vim.trim(res.stdout) == 'True'
      else
        M.status.node_ready = false
      end
      done()
    end
  )
end

local function term_cmd(cmd, title)
  return function()
    -- Native Windows: fail loud with a hint instead of opening a terminal
    -- that errors (k9s/lazygit are not installed there; Linux-only cmds are
    -- pre-routed through wsl.exe by the callers via M.wsl_wrap).
    if M.is_win and cmd[1] ~= 'wsl.exe' and vim.fn.executable(cmd[1]) == 0 then
      vim.notify(cmd[1] .. ' ist auf Windows nicht installiert — in WSL nutzen oder installieren.',
        vim.log.levels.WARN, { title = 'nodectl' })
      return
    end
    local ok, terminal = pcall(require, 'snacks.terminal')
    if ok and terminal and terminal.open then
      terminal.open(cmd, { win = { position = 'float' } })
    else
      vim.cmd('terminal ' .. table.concat(cmd, ' '))
    end
    if title then vim.notify(title, vim.log.levels.INFO, { title = 'nodectl' }) end
  end
end

--- Flat rows for the `infrastructure-node` sub-page (page-based dashboard
--- shell, T900655+): probe display rows, missing-binary rows, checklist
--- rows, then the explicit entry points. Rendering never probes or spawns
--- anything (page-shell doctrine): the only shell work is the `r` entry,
--- which runs the async probes and re-renders the page via the callback.
---
--- `refresh_action` (a function) is rendered as the `r` probe-refresh row
--- between the checklist and the edit entry; pass nil for a static view.
function M.node_rows(refresh_action)
  local items = {}
  -- cluster probes (display rows; tristate PROBING until the first probe lands).
  local ctx = M.status.contexts or {}
  for _, c in ipairs({ 'fleet', 'devmesh' }) do
    local st = 'PROBING'
    if M.status.probed_at ~= 0 then st = (ctx[c] == true) and 'ONLINE' or 'OFFLINE' end
    items[#items + 1] = { desc = string.format('context %-12s [%s]', c, st) }
  end
  do
    local st = 'PROBING'
    if M.status.probed_at ~= 0 then st = (M.status.node_ready == true) and 'ONLINE' or 'OFFLINE' end
    items[#items + 1] = { desc = string.format('gpu-cluster-3 %-9s [%s]', 'Ready', st) }
  end
  -- missing binaries (only the ones that are absent; no shell, vim.fn.executable).
  for _, b in ipairs(M.probe_bins()) do
    if not b.ok then
      items[#items + 1] = { desc = b.name .. ' fehlt [' .. b.hint .. ']' }
    end
  end
  -- the checklist itself (display rows; clicking opens the file).
  local shown = 0
  for _, it in ipairs(M.parse_checklist()) do
    if shown >= 14 then
      items[#items + 1] = { desc = '… weitere Punkte in SETUP_CHECKLIST.md', action = M.open_checklist }
      break
    end
    shown = shown + 1
    items[#items + 1] = { desc = (it.done and '✔ ' or '☐ ') .. it.text:sub(1, 52), action = M.open_checklist }
  end
  -- explicit entry points (key + action, plain string desc — F5-safe).
  if refresh_action then
    items[#items + 1] = { key = 'r', desc = 'Probe aktualisieren', action = refresh_action }
  end
  items[#items + 1] = { key = 'n', desc = 'Checkliste bearbeiten', action = M.open_checklist }
  return items
end

--- User commands + <leader>N keymaps. Safe to call twice.
function M.setup()
  if _G._nodectl_setup_done then return end
  _G._nodectl_setup_done = true

  vim.api.nvim_create_user_command('NodeChecklist', M.open_checklist,
    { desc = 'nodectl: SETUP_CHECKLIST.md öffnen' })
  vim.api.nvim_create_user_command('NodeStatus', function()
    -- status.sh is a Linux script (needs devmesh context + Linux tools):
    -- WSL-routed on native Windows, direct elsewhere (wsl_wrap is pass-through)
    term_cmd(M.wsl_wrap({ 'bash', M.linux_root .. '/scripts/devmesh/status.sh' }))()
  end, { desc = 'nodectl: devmesh status.sh im Float-Terminal' })
  vim.api.nvim_create_user_command('NodeK9sFleet', function()
    term_cmd({ 'k9s', '--context', 'fleet' })()
  end, { desc = 'nodectl: k9s gegen fleet' })
  vim.api.nvim_create_user_command('NodeK9sDevmesh', function()
    term_cmd({ 'k9s', '--context', 'devmesh' })()
  end, { desc = 'nodectl: k9s gegen devmesh' })

  local map = vim.keymap.set
  map('n', '<leader>Nc', M.open_checklist, { desc = 'nodectl: Checklist', silent = true })
  map('n', '<leader>Nk', ':Kubectl<CR>', { desc = 'nodectl: kubectl view', silent = true })
  map('n', '<leader>Nf', ':NodeK9sFleet<CR>', { desc = 'nodectl: k9s fleet', silent = true })
  map('n', '<leader>Nd', ':NodeK9sDevmesh<CR>', { desc = 'nodectl: k9s devmesh', silent = true })
  map('n', '<leader>Ns', ':NodeStatus<CR>', { desc = 'nodectl: devmesh status', silent = true })

  if has_plugin('which-key') then
    pcall(require('which-key').add, { { '<leader>N', group = 'nodectl (node control)' } })
  end
end

return M
