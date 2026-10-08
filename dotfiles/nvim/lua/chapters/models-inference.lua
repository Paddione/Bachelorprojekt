-- Kapitel Models & Inference (T901043 p7, Ticket T901052).
-- SSOT: scripts/llm/loadouts.json (12 Loadouts, Stand 2026-10-08 — zur
-- Laufzeit gelesen, nie Konstanten). Status je Loadout wird live geprobt
-- (Port + /v1/models); Start/Stop nur nach expliziter Auswahl und
-- Bestaetigung (der Bestaetigungsdialog des Aktionsmodells).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')
local gitroot = require('core.gitroot')

local function project_root()
  local ok, root = pcall(gitroot.root)
  if ok and root then
    return root
  end
  return vim.fn.getcwd()
end

function M.loadouts_file()
  return project_root() .. '/scripts/llm/loadouts.json'
end

--- Loadouts aus der JSON lesen (keine Konstanten im Modul).
function M.loadouts()
  local path = M.loadouts_file()
  local lines = vim.fn.readfile(path)
  if #lines == 0 then
    return {}
  end
  local ok, data = pcall(vim.json.decode, table.concat(lines, '\n'))
  if not ok or type(data) ~= 'table' then
    return {}
  end
  return data.loadouts or {}
end

function M.probe_port(port)
  local res = vim.system(
    { 'curl', '-s', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:' .. tostring(port) .. '/v1/models' },
    { text = true }
  ):wait()
  return (tonumber(vim.trim(res.stdout or '')) or 0) ~= 0
end

function M.gpu_present()
  return vim.fn.executable('nvidia-smi') == 1
end

function M.loadout_status(cwd)
  local lines = {}
  for _, l in ipairs(M.loadouts()) do
    local up = M.probe_port(l.port)
    lines[#lines + 1] = l.slug .. ' (:' .. tostring(l.port) .. '): ' .. (up and 'up' or 'down')
  end
  if #lines == 0 then
    vim.notify('models-inference: no loadouts in ' .. M.loadouts_file(), vim.log.levels.WARN)
    return
  end
  vim.notify(table.concat(lines, '\n'))
end

function M.loadout_start(cwd)
  local names = {}
  for _, l in ipairs(M.loadouts()) do
    names[#names + 1] = l.slug
  end
  vim.ui.select(names, { prompt = 'Loadout starten (bestaetigt):' }, function(slug)
    if slug then
      vim.notify('models-inference: start ' .. slug .. ' — bestaetigt, Startbefehl siehe Runbook')
    end
  end)
end

function M.loadout_stop(cwd)
  local names = {}
  for _, l in ipairs(M.loadouts()) do
    names[#names + 1] = l.slug
  end
  vim.ui.select(names, { prompt = 'Loadout stoppen (bestaetigt):' }, function(slug)
    if slug then
      vim.notify('models-inference: stop ' .. slug .. ' — bestaetigt, Stoppbefehl siehe Runbook')
    end
  end)
end

function M.gpu_status(cwd)
  if not M.gpu_present() then
    vim.notify('models-inference: nvidia-smi not on PATH', vim.log.levels.WARN)
    return
  end
  local res = vim.system({ 'nvidia-smi', '--query-gpu=index,name,memory.used,memory.total', '--format=csv,noheader' }, { text = true }):wait()
  vim.notify(vim.trim(res.stdout ~= '' and res.stdout or 'nvidia-smi: no output'))
end

local ACTIONS = {
  action_mod.new({ name = 'loadout-status', target = 'loadout', effect = function(cwd) M.loadout_status(cwd) end }),
  action_mod.new({
    name = 'loadout-start',
    target = 'loadout',
    inputs = { { name = 'loadout', prompt = 'Loadout: ' } },
    effect = function(cwd) M.loadout_start(cwd) end,
  }),
  action_mod.new({
    name = 'loadout-stop',
    target = 'loadout',
    inputs = { { name = 'loadout', prompt = 'Loadout: ' } },
    effect = function(cwd) M.loadout_stop(cwd) end,
  }),
  action_mod.new({ name = 'gpu-status', target = 'gpu', effect = function(cwd) M.gpu_status(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 's', 't', 'p', 'g' }

dashboard_mod.register('models-inference', {
  title = 'Models & Inference',
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
