-- Plugin-Lademechanik (T901043 p1): lazy.nvim-Bootstrap + konsolidiertes
-- Spec-Set. Plugin-ENTSCHEIDE (Picker/Terminal/Completion) gehoeren zu p2
-- und sind in lua/plugins/*.lua dokumentiert; hier nur die Mechanik.
local M = {}

local function lazy_path()
  return vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
end

--- Ensure lazy.nvim exists and is on the rtp. Returns false (no hard
--- failure) when offline or when the clone fails: the dashboard core
--- (Seiten, Suche, Aktionen) funktioniert auch ohne installierte Plugins.
function M.ensure()
  local path = lazy_path()
  if vim.fn.filereadable(path .. '/lua/lazy/init.lua') == 0 then
    if os.getenv('NVIM_DASHBOARD_OFFLINE') == '1' then
      return false
    end
    if vim.fn.executable('git') == 0 then
      return false
    end
    local res = vim.system({
      'git',
      'clone',
      '--filter=blob:none',
      'https://github.com/folke/lazy.nvim.git',
      path,
    }, { text = true, timeout = 8000 }):wait()
    if res.code ~= 0 or vim.fn.filereadable(path .. '/lua/lazy/init.lua') == 0 then
      vim.notify('core.lazy: lazy.nvim bootstrap failed (offline?) — continuing without plugins', vim.log.levels.WARN)
      return false
    end
  end
  vim.opt.rtp:prepend(path)
  return true
end

--- Plugin specs (SSOT der installierten Menge).
function M.specs()
  return {
    { import = 'plugins.core' },
    { import = 'plugins.editor' },
  }
end

--- Bootstrap: ensure + setup. Called once from init.lua.
function M.bootstrap()
  if not M.ensure() then
    return false
  end
  local ok, lazy = pcall(require, 'lazy')
  if not ok then
    vim.notify('core.lazy: lazy module not loadable — continuing without plugins', vim.log.levels.WARN)
    return false
  end
  lazy.setup(M.specs())
  return true
end

return M
