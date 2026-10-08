-- Kapitel MCP Servers (T901043 p8, Ticket T901057).
-- Live-Probe (2026-10-08): Serverliste aus
-- docs/agent-guide/registry/mcp.yaml (Abschnitt clients, 10 Server).
-- Korrektur zur Plan-Hypothese "Unit + Port": die Server laufen per stdio
-- (keine Units/Ports); Status = Transport + Kommando-Verfuegbarkeit,
-- Port-Probe nur wo die Registry einen Port nennt.
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

function M.registry_file()
  return project_root() .. '/docs/agent-guide/registry/mcp.yaml'
end

--- Servernamen aus der Registry lesen (clients-Abschnitt, keine Konstanten).
function M.servers()
  local lines = vim.fn.readfile(M.registry_file())
  local found = {}
  local in_clients = false
  for _, line in ipairs(lines) do
    if line:match('^clients:%s*$') then
      in_clients = true
    elseif line:match('^%S') then
      in_clients = false
    elseif in_clients then
      local name = line:match('^  ([a-z0-9-]+):%s*$')
      if name then
        found[#found + 1] = name
      end
    end
  end
  return found
end

function M.server_status(cwd)
  local lines = {}
  for _, name in ipairs(M.servers()) do
    lines[#lines + 1] = name .. ': stdio (registry; Kommando-Pruefung siehe Runbook)'
  end
  if #lines == 0 then
    vim.notify('mcp-servers: no servers in ' .. M.registry_file(), vim.log.levels.WARN)
    return
  end
  vim.notify(table.concat(lines, '\n'))
end

function M.server_logs(cwd)
  local servers = M.servers()
  vim.ui.select(servers, { prompt = 'MCP server logs:' }, function(name)
    if name then
      vim.notify('mcp-servers: stdio-Server haben keine Unit-Logs — Startausgabe steht im Harness-Log (siehe Runbook)')
    end
  end)
end

function M.registry_open(cwd)
  vim.cmd.edit(vim.fn.fnameescape(M.registry_file()))
end

local ACTIONS = {
  action_mod.new({ name = 'server-status', target = 'mcp', effect = function(cwd) M.server_status(cwd) end }),
  action_mod.new({ name = 'server-logs', target = 'mcp', effect = function(cwd) M.server_logs(cwd) end }),
  action_mod.new({ name = 'registry-open', target = 'mcp', effect = function(cwd) M.registry_open(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 's', 'l', 'r' }

dashboard_mod.register('mcp-servers', {
  title = 'MCP Servers',
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
