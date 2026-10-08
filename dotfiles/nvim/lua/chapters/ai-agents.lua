-- Kapitel AI & Agents (T901043 p6, Ticket T901051).
-- Live-Probe (2026-10-08): alle sieben Agent-CLIs vorhanden (opencode,
-- muse, claude, codex, qwen, pi, agy). Anzeige zur Laufzeit per
-- executable()-Probe — nur vorhandene CLIs erscheinen.
-- opencode.nvim bleibt das eingebettete Plugin (Begruendung im Runbook:
-- snacks-kompatibel, kein zweites Agent-Plugin noetig).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

local KNOWN = { 'opencode', 'muse', 'claude', 'codex', 'qwen', 'pi', 'agy' }

--- Nur live vorhandene Agent-CLIs (Laufzeit-Probe, keine Konstanten).
function M.agents()
  local found = {}
  for _, cli in ipairs(KNOWN) do
    if vim.fn.executable(cli) == 1 then
      found[#found + 1] = cli
    end
  end
  return found
end

local function term(cmd, cwd)
  local ok, sn = pcall(require, 'snacks.terminal')
  if ok and sn then
    sn.open(cmd, { cwd = cwd })
  else
    vim.notify('ai-agents: terminal not loaded — run manually: ' .. table.concat(cmd, ' '))
  end
end

function M.agent_start(cwd)
  local agents = M.agents()
  if #agents == 0 then
    vim.notify('ai-agents: no agent CLI on PATH', vim.log.levels.WARN)
    return
  end
  vim.ui.select(agents, { prompt = 'Agent starten (im Git-Root):' }, function(cli)
    if cli then
      term({ cli }, cwd)
    end
  end)
end

function M.file_context(cwd)
  local file = vim.api.nvim_buf_get_name(0)
  if file == '' then
    vim.notify('ai-agents: no file in current buffer', vim.log.levels.WARN)
    return
  end
  local agents = M.agents()
  vim.ui.select(agents, { prompt = 'Agent mit Dateikontext starten:' }, function(cli)
    if cli then
      term({ cli, file }, cwd)
    end
  end)
end

function M.selection_context(cwd)
  vim.notify('ai-agents: selection as context — yank, then start agent with file context (see runbook)')
end

local ACTIONS = {
  action_mod.new({ name = 'agent-start', target = 'agent', effect = function(cwd) M.agent_start(cwd) end }),
  action_mod.new({ name = 'file-context', target = 'agent', effect = function(cwd) M.file_context(cwd) end }),
  action_mod.new({ name = 'selection-context', target = 'agent', effect = function(cwd) M.selection_context(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'a', 'f', 's' }

dashboard_mod.register('ai-agents', {
  title = 'AI & Agents',
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
