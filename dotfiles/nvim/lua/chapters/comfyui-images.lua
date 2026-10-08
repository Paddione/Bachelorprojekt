-- Kapitel ComfyUI & Images (T901043 p7, Ticket T901053).
-- Live-Proben (2026-10-08): Dienst inaktiv, kein Listener auf 8189/8190,
-- scripts/start-comfyui.sh vorhanden + ausfuehrbar. Port aus Service/
-- Umgebung (Default 8189), Remote-Host (8190) nur bei Erreichbarkeit.
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

--- Port aus Umgebung, sonst Default 8189 (keine Konstante im Aufrufpfad).
function M.port()
  local env = os.getenv('COMFYUI_PORT')
  if env and tonumber(env) then
    return tonumber(env)
  end
  return 8189
end

function M.remote_available()
  local res = vim.system(
    { 'curl', '-s', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:8190/' },
    { text = true }
  ):wait()
  return (tonumber(vim.trim(res.stdout or '')) or 0) ~= 0
end

function M.service_active()
  local res = vim.system({ 'systemctl', '--user', 'is-active', 'comfyui' }, { text = true }):wait()
  return vim.trim(res.stdout or '') == 'active'
end

function M.status(cwd)
  local lines = {
    'comfyui: port ' .. M.port() .. ', service ' .. (M.service_active() and 'active' or 'inactive'),
    'remote 8190: ' .. (M.remote_available() and 'reachable' or 'not reachable'),
  }
  vim.notify(table.concat(lines, '\n'))
end

function M.start(cwd)
  local script = project_root() .. '/scripts/start-comfyui.sh'
  if vim.fn.executable(script) == 0 then
    vim.notify('comfyui-images: start script missing: ' .. script, vim.log.levels.WARN)
    return
  end
  local ok, sn = pcall(require, 'snacks.terminal')
  if ok and sn then
    sn.open({ 'bash', script }, { cwd = cwd })
  else
    vim.notify('comfyui-images: terminal not loaded — run manually: bash ' .. script)
  end
end

function M.workflow_run(cwd)
  vim.ui.input({ prompt = 'Workflow file: ' }, function(wf)
    if wf and wf ~= '' then
      vim.notify('comfyui-images: queue workflow ' .. wf .. ' on port ' .. M.port() .. ' (see runbook)')
    end
  end)
end

function M.output_open(cwd)
  vim.notify('comfyui-images: outputs under ComfyUI/output — open via files-search (see runbook)')
end

local ACTIONS = {
  action_mod.new({ name = 'status', target = 'comfyui', effect = function(cwd) M.status(cwd) end }),
  action_mod.new({ name = 'start', target = 'comfyui', effect = function(cwd) M.start(cwd) end }),
  action_mod.new({
    name = 'workflow-run',
    target = 'comfyui',
    inputs = { { name = 'workflow', prompt = 'Workflow file: ' } },
    effect = function(cwd) M.workflow_run(cwd) end,
  }),
  action_mod.new({ name = 'output-open', target = 'comfyui', effect = function(cwd) M.output_open(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 's', 't', 'w', 'o' }

dashboard_mod.register('comfyui-images', {
  title = 'ComfyUI & Images',
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
