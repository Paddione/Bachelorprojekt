-- Aktionsmodell: sichtbarer Zwei-Schritt (T901043 p1).
-- Jede Aktion: { name, inputs, target, effect, cwd, on_error }.
-- Fokussieren (Suche springt zur Aktion) fuehrt NIE aus; Ausfuehren ist ein
-- separater, bestaetigter Schritt. `cwd` wird erst beim Ausfuehren aus dem
-- aktuellen Buffer aufgeloest (core.gitroot), damit schon das Bauen und
-- Fokussieren von Seiten garantiert seitenffektfrei ist.
local M = {}

local gitroot = require('core.gitroot')

local function default_on_error(err)
  vim.notify('action failed: ' .. tostring(err), vim.log.levels.ERROR)
end

--- Build an action definition. `cwd` may be a string or a zero-arg
--- resolver (default: buffer Git-root via core.gitroot).
function M.new(def)
  assert(type(def.name) == 'string', 'action needs a name')
  assert(type(def.effect) == 'function', 'action needs an effect')
  return {
    name = def.name,
    inputs = def.inputs or {},
    target = def.target or 'repo',
    effect = def.effect,
    cwd = def.cwd or function()
      return gitroot.root()
    end,
    on_error = def.on_error or default_on_error,
  }
end

--- Resolve the working directory for an action (nil + warning when none).
function M.resolve_cwd(action)
  local cwd = action.cwd
  if type(cwd) == 'function' then
    cwd = cwd()
  end
  if cwd == nil or cwd == '' then
    vim.notify('action ' .. action.name .. ': no project (open a file inside a checkout first)', vim.log.levels.WARN)
    return nil
  end
  return cwd
end

--- Explicit execute step: confirm, then run the effect. Never called from
--- page building, focusing or search — only from the user's run keypress.
function M.run(action)
  local cwd = M.resolve_cwd(action)
  if not cwd then
    return false
  end
  vim.ui.select({ 'Ausfuehren', 'Abbrechen' }, { prompt = 'Aktion ausfuehren: ' .. action.name }, function(choice)
    if choice ~= 'Ausfuehren' then
      return
    end
    local ok, err = pcall(action.effect, cwd)
    if not ok then
      action.on_error(err)
    end
  end)
  return true
end

return M
