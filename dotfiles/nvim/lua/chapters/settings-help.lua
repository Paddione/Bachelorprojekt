-- Kapitel Settings & Help (T901043 p8, Ticket T901058 Teil 1).
-- Lazy, which-key, checkhealth, Config-Recovery. Recovery zeigt zur
-- Laufzeit vorhandene nvim-backup-*-Verzeichnisse (K10-Pfade auf geloeschte
-- Backups sind ersetzt — kein hart codierter Pfad).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

--- Vorhandene Config-Backups zur Laufzeit finden (kein fester Pfad).
function M.backups()
  local home = os.getenv('HOME') or ''
  local found = {}
  for _, base in ipairs({ home .. '/.config', '/tmp/opencode' }) do
    local glob = vim.fn.glob(base .. '/nvim-backup-*', false, true)
    for _, path in ipairs(glob) do
      if vim.fn.isdirectory(path) == 1 then
        found[#found + 1] = path
      end
    end
  end
  return found
end

function M.lazy_ui(cwd)
  local ok = pcall(vim.cmd, 'Lazy')
  if not ok then
    vim.notify('settings-help: lazy.nvim UI not loaded', vim.log.levels.WARN)
  end
end

function M.whichkey_help(cwd)
  local ok = pcall(vim.cmd, 'WhichKey')
  if not ok then
    vim.notify('settings-help: which-key not loaded', vim.log.levels.WARN)
  end
end

function M.checkhealth(cwd)
  vim.cmd('checkhealth')
end

function M.config_recovery(cwd)
  local backups = M.backups()
  if #backups == 0 then
    vim.notify('settings-help: no nvim-backup-* found — Backup-Befehl siehe Runbook', vim.log.levels.WARN)
    return
  end
  vim.ui.select(backups, { prompt = 'Backup wiederherstellen (bestaetigt):' }, function(bk)
    if bk then
      vim.notify('settings-help: restore from ' .. bk .. ' — Schritte siehe Runbook Recovery')
    end
  end)
end

local ACTIONS = {
  action_mod.new({ name = 'lazy-ui', target = 'config', effect = function(cwd) M.lazy_ui(cwd) end }),
  action_mod.new({ name = 'whichkey-help', target = 'config', effect = function(cwd) M.whichkey_help(cwd) end }),
  action_mod.new({ name = 'checkhealth', target = 'config', effect = function(cwd) M.checkhealth(cwd) end }),
  action_mod.new({ name = 'config-recovery', target = 'config', effect = function(cwd) M.config_recovery(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'l', 'w', 'c', 'r' }

dashboard_mod.register('settings-help', {
  title = 'Settings & Help',
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
