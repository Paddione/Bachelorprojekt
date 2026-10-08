-- Kapitel Repository & Code Knowledge (T901043 p6, Ticket T901050).
-- Live-Proben (2026-10-08):
-- - K3-Graph: MCP-Server codebase-memory-mcp (stdio-Binary
--   ~/.local/bin/codebase-memory-mcp, Bridge http://127.0.0.1:18235,
--   3D-Webview http://127.0.0.1:9749 erreichbar). Es gibt KEIN Shell-CLI
--   (`cli` existiert nicht); die verifizierte Aufrufform ist der
--   MCP-Tool-Call ueber den Harness (search_graph, trace_path,
--   get_code_snippet, query_graph) bzw. die Webview.
-- - docs/brain/k3-code-graph.md existiert (K5-Hypothese "abgeschafft"
--   widerlegt); kein brain-Verweis noetig, Pfad steht im Runbook.
-- - Semantik-Backend (LM Studio http://127.0.0.1:1234) nicht erreichbar:
--   semantische Suche wird nur bei erreichbarem Backend angeboten,
--   sonst klare Meldung statt toter Aktion.
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

M.BRIDGE = 'http://127.0.0.1:18235/mcp/codebase-memory-mcp'
M.WEBVIEW = 'http://127.0.0.1:9749'
M.SEMANTIC = 'http://127.0.0.1:1234/v1/models'
M.GRAPH_DOC = 'docs/brain/k3-code-graph.md'

local function reachable(url)
  local res = vim.system({ 'curl', '-s', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', url }, { text = true }):wait()
  local code = tonumber(vim.trim(res.stdout or '')) or 0
  return code ~= 0
end

function M.backend_available()
  return reachable(M.SEMANTIC)
end

function M.bridge_available()
  return reachable(M.BRIDGE)
end

local function show_mcp_form(tool, hint)
  local lines = {
    'K3 code graph — MCP tool call (via harness MCP, kein Shell-CLI):',
    '  tool: ' .. tool,
    '  ' .. hint,
    'Bridge: ' .. M.BRIDGE,
    'Webview: ' .. M.WEBVIEW,
    'Referenz: ' .. M.GRAPH_DOC,
  }
  vim.notify(table.concat(lines, '\n'))
end

function M.symbol_search(cwd)
  vim.ui.input({ prompt = 'Symbol pattern: ' }, function(q)
    if q and q ~= '' then
      show_mcp_form('search_graph', 'name_pattern="' .. q .. '"')
    end
  end)
end

function M.call_graph(cwd)
  vim.ui.input({ prompt = 'Function name: ' }, function(fn)
    if fn and fn ~= '' then
      show_mcp_form('trace_path', 'function_name="' .. fn .. '", direction=inbound/outbound')
    end
  end)
end

function M.architecture(cwd)
  show_mcp_form('get_architecture', 'high-level project summary')
end

function M.code_snippet(cwd)
  vim.ui.input({ prompt = 'Qualified name: ' }, function(qn)
    if qn and qn ~= '' then
      show_mcp_form('get_code_snippet', 'qualified_name="' .. qn .. '"')
    end
  end)
end

function M.semantic_search(cwd)
  if not M.backend_available() then
    vim.notify(
      'repo-knowledge: semantic backend not reachable (' .. M.SEMANTIC .. ') — Symbol-Suche (K3) nutzen',
      vim.log.levels.WARN
    )
    return
  end
  vim.ui.input({ prompt = 'Semantic query: ' }, function(q)
    if q and q ~= '' then
      vim.notify('repo-knowledge: bge_embed query "' .. q .. '" via harness bge-mcp')
    end
  end)
end

local ACTIONS = {
  action_mod.new({
    name = 'symbol-search',
    target = 'graph',
    inputs = { { name = 'pattern', prompt = 'Symbol pattern: ' } },
    effect = function(cwd) M.symbol_search(cwd) end,
  }),
  action_mod.new({
    name = 'call-graph',
    target = 'graph',
    inputs = { { name = 'function', prompt = 'Function name: ' } },
    effect = function(cwd) M.call_graph(cwd) end,
  }),
  action_mod.new({ name = 'architecture-layers', target = 'graph', effect = function(cwd) M.architecture(cwd) end }),
  action_mod.new({
    name = 'code-snippet',
    target = 'graph',
    inputs = { { name = 'qualified_name', prompt = 'Qualified name: ' } },
    effect = function(cwd) M.code_snippet(cwd) end,
  }),
  action_mod.new({ name = 'semantic-search', target = 'embeddings', effect = function(cwd) M.semantic_search(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 's', 'g', 'a', 'c', 'e' }

dashboard_mod.register('repo-knowledge', {
  title = 'Repository & Code Knowledge',
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
