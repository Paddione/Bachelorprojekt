-- Kapitel Tests & Plans (T901043 p9, Befund I4).
-- Einstiege fuer Testzonen, Plaene und Skills: Test-zu-Datei (Graph-Kanten
-- oder Namenskonvention), Einzel-Test mit quickfix, Plan-Browser
-- (tasks.md + tasks.d), Skill-Browser (SKILL.md).
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

--- Test-Datei zur aktuellen Datei: Namenskonvention (foo.lua ->
--- foo_spec.lua / test_foo.py / foo.test.*) oder Graph-Kante.
function M.test_for(file)
  if file == nil or file == '' then
    return nil
  end
  local stem = file:gsub('%.lua$', ''):gsub('%.js$', ''):gsub('%.ts$', '')
  local dir = vim.fn.fnamemodify(file, ':h')
  local base = vim.fn.fnamemodify(file, ':t:r')
  local py_base = base:gsub('[-.]', '_')
  local candidates = {
    stem .. '_spec.lua',
    dir .. '/test_' .. py_base .. '.py',
    stem .. '.test.ts',
    stem .. '.test.js',
  }
  for _, c in ipairs(candidates) do
    if vim.fn.filereadable(c) == 1 then
      return c
    end
  end
  local glob = vim.fn.glob(project_root() .. '/tests/py/**/test_' .. py_base .. '*.py', false, true)
  if #glob > 0 then
    return glob[1]
  end
  return nil
end

function M.test_file(cwd)
  local file = vim.api.nvim_buf_get_name(0)
  local test = M.test_for(file)
  if not test then
    vim.notify('tests-plans: no test found for ' .. (file ~= '' and file or '(unnamed buffer)'), vim.log.levels.WARN)
    return
  end
  vim.cmd.edit(vim.fn.fnameescape(test))
end

function M.test_single(cwd)
  local file = vim.fn.expand('%:p')
  vim.ui.input({ prompt = 'Test filter: ' }, function(filter)
    if filter == nil then
      return
    end
    local ok, sn = pcall(require, 'snacks.terminal')
    local runner = project_root() .. '/scripts/pytest-run.sh'
    local cmd = { 'bash', runner, file, '-k', filter }
    if ok and sn then
      sn.open(cmd, { cwd = cwd })
    else
      vim.notify('tests-plans: run manually: bash ' .. runner .. ' ' .. file .. " -k '" .. filter .. "' (quickfix: :cgetbuffer)")
    end
  end)
end

function M.plan_browser(cwd, root)
  root = root or project_root()
  local plans = vim.fn.glob(root .. '/.agents/plans/*/tasks.md', false, true)
  if #plans == 0 then
    vim.notify('tests-plans: no staged plans (.agents/plans/*/tasks.md)', vim.log.levels.WARN)
    return
  end
  vim.ui.select(plans, { prompt = 'Plan oeffnen (tasks.md + tasks.d):' }, function(plan)
    if plan then
      vim.cmd.edit(vim.fn.fnameescape(plan))
    end
  end)
end

function M.skill_browser(cwd, root)
  root = root or project_root()
  local skills = vim.fn.glob(root .. '/.agents/skills/*/SKILL.md', false, true)
  if #skills == 0 then
    vim.notify('tests-plans: no skills (.agents/skills/*/SKILL.md)', vim.log.levels.WARN)
    return
  end
  vim.ui.select(skills, { prompt = 'Skill oeffnen (SKILL.md):' }, function(skill)
    if skill then
      vim.cmd.edit(vim.fn.fnameescape(skill))
    end
  end)
end

local ACTIONS = {
  action_mod.new({ name = 'test-file', target = 'test', effect = function(cwd) M.test_file(cwd) end }),
  action_mod.new({
    name = 'test-single',
    target = 'test',
    inputs = { { name = 'filter', prompt = 'Test filter: ' } },
    effect = function(cwd) M.test_single(cwd) end,
  }),
  action_mod.new({ name = 'plan-browser', target = 'plan', effect = function(cwd) M.plan_browser(cwd) end }),
  action_mod.new({ name = 'skill-browser', target = 'skill', effect = function(cwd) M.skill_browser(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 't', 's', 'p', 'k' }

dashboard_mod.register('tests-plans', {
  title = 'Tests & Plans',
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
