-- Kapitel Infrastructure, inkl. Node Control (T901043 p8, T901054).
-- Live-Proben (2026-10-08): Contexts fleet (*) + devmesh (beide gueltig,
-- keine hart codierten Namen); Forward-Units devmesh-forward,
-- pgvector-forward, postgres-prod-forward, mcp-gateway alle active.
-- kubectl.nvim, k9s und lazygit als Terminal-Aktionen; keine
-- Deploy-Aktion; Forward-Units als Status.
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

local FORWARD_UNITS = { 'devmesh-forward', 'pgvector-forward', 'postgres-prod-forward', 'mcp-gateway' }

function M.kubectl_available()
  return vim.fn.executable('kubectl') == 1
end

function M.contexts()
  if not M.kubectl_available() then
    return {}
  end
  local res = vim.system({ 'kubectl', 'config', 'get-contexts', '--no-headers', '-o', 'name' }, { text = true }):wait()
  local out = {}
  for line in (res.stdout or ''):gmatch('[^\n]+') do
    line = vim.trim(line)
    if line == 'fleet' or line == 'devmesh' then
      out[#out + 1] = line
    end
  end
  return out
end

function M.forward_status()
  local states = {}
  for _, unit in ipairs(FORWARD_UNITS) do
    local res = vim.system({ 'systemctl', '--user', 'is-active', unit }, { text = true }):wait()
    states[unit] = vim.trim(res.stdout or 'unknown')
  end
  return states
end

local function term(cmd, cwd)
  local ok, sn = pcall(require, 'snacks.terminal')
  if ok and sn then
    sn.open(cmd, { cwd = cwd })
  else
    vim.notify('infrastructure: terminal not loaded — run manually: ' .. table.concat(cmd, ' '))
  end
end

local function need_kubectl()
  if not M.kubectl_available() then
    vim.notify('infrastructure: kubectl not on PATH', vim.log.levels.WARN)
    return false
  end
  return true
end

function M.cluster_status(cwd)
  if not need_kubectl() then
    return
  end
  local lines = { 'contexts: ' .. table.concat(M.contexts(), ', ') }
  for unit, state in pairs(M.forward_status()) do
    lines[#lines + 1] = unit .. ': ' .. state
  end
  vim.notify(table.concat(lines, '\n'))
end

function M.pods(cwd)
  if not need_kubectl() then
    return
  end
  term({ 'k9s', '--context', 'fleet', '-n', 'workspace' }, cwd)
end

function M.services(cwd)
  if not need_kubectl() then
    return
  end
  term({ 'kubectl', '--context', 'fleet', '-n', 'workspace', 'get', 'svc' }, cwd)
end

function M.pod_logs(cwd)
  if not need_kubectl() then
    return
  end
  vim.ui.input({ prompt = 'Pod: ' }, function(pod)
    if pod and pod ~= '' then
      term({ 'kubectl', '--context', 'fleet', '-n', 'workspace', 'logs', '--tail', '100', pod }, cwd)
    end
  end)
end

function M.context_select(cwd)
  if not need_kubectl() then
    return
  end
  vim.ui.select({ 'fleet', 'devmesh' }, { prompt = 'Context (nur Anzeige-Kontext):' }, function(ctx)
    if ctx then
      vim.notify('infrastructure: Anzeige-Kontext ' .. ctx .. ' (kein Switch ohne Bestaetigung — siehe Runbook)')
    end
  end)
end

function M.setup_checklist(cwd)
  vim.notify('infrastructure: Setup-Checkliste siehe runbooks/infrastructure.md')
end

local ACTIONS = {
  action_mod.new({ name = 'cluster-status', target = 'cluster', effect = function(cwd) M.cluster_status(cwd) end }),
  action_mod.new({ name = 'pods', target = 'cluster', effect = function(cwd) M.pods(cwd) end }),
  action_mod.new({ name = 'services', target = 'cluster', effect = function(cwd) M.services(cwd) end }),
  action_mod.new({
    name = 'pod-logs',
    target = 'pod',
    inputs = { { name = 'pod', prompt = 'Pod: ' } },
    effect = function(cwd) M.pod_logs(cwd) end,
  }),
  action_mod.new({ name = 'context-select', target = 'cluster', effect = function(cwd) M.context_select(cwd) end }),
  action_mod.new({ name = 'setup-checklist', target = 'docs', effect = function(cwd) M.setup_checklist(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 's', 'p', 'v', 'l', 'c', 'k' }

dashboard_mod.register('infrastructure', {
  title = 'Infrastructure',
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
