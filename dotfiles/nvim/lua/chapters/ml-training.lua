-- Kapitel ML & Training (T901043 p8, Ticket T901056).
-- Live-Proben (2026-10-08): ML-Zonen vorhanden (ml/, .agents/training,
-- scripts/finetune, ~/unsloth-boxes). Datensaetze und Laeufe werden zur
-- Laufzeit entdeckt; kein Trainingsstart ohne explizite Bestaetigung
-- (Bestaetigungsdialog des Aktionsmodells).
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

local ZONES = { 'ml', '.agents/training', 'scripts/finetune' }

--- ML-Zonen live erheben (Repo-Pfade + ~/unsloth-boxes).
function M.zones()
  local root = project_root()
  local found = {}
  for _, rel in ipairs(ZONES) do
    if vim.fn.isdirectory(root .. '/' .. rel) == 1 then
      found[#found + 1] = rel
    end
  end
  local home = os.getenv('HOME') or ''
  if vim.fn.isdirectory(home .. '/unsloth-boxes') == 1 then
    found[#found + 1] = '~/unsloth-boxes'
  end
  return found
end

function M.dataset_open(cwd)
  vim.notify('ml-training: Zonen — ' .. table.concat(M.zones(), ', ') .. ' (Datensatz per files-search oeffnen)')
end

function M.run_status(cwd)
  local root = project_root()
  local res = vim.system({ 'ls', root .. '/ml' }, { text = true }):wait()
  vim.notify('ml-training: ml/ — ' .. vim.trim(res.stdout ~= '' and res.stdout or '(leer oder fehlt)'))
end

function M.run_logs(cwd)
  vim.ui.input({ prompt = 'Run/Log-Datei: ' }, function(log)
    if log and log ~= '' then
      vim.cmd.edit(vim.fn.fnameescape(log))
    end
  end)
end

function M.box_status(cwd)
  local home = os.getenv('HOME') or ''
  local res = vim.system({ 'ls', home .. '/unsloth-boxes' }, { text = true }):wait()
  vim.notify('ml-training: unsloth-boxes — ' .. vim.trim(res.stdout ~= '' and res.stdout or '(leer oder fehlt)'))
end

local ACTIONS = {
  action_mod.new({ name = 'dataset-open', target = 'ml', effect = function(cwd) M.dataset_open(cwd) end }),
  action_mod.new({ name = 'run-status', target = 'ml', effect = function(cwd) M.run_status(cwd) end }),
  action_mod.new({
    name = 'run-logs',
    target = 'ml',
    inputs = { { name = 'log', prompt = 'Run/Log-Datei: ' } },
    effect = function(cwd) M.run_logs(cwd) end,
  }),
  action_mod.new({ name = 'box-status', target = 'ml', effect = function(cwd) M.box_status(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'd', 'r', 'l', 'b' }

dashboard_mod.register('ml-training', {
  title = 'ML & Training',
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
