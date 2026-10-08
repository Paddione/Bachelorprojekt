-- Kapitel SDLC (T901043 p5, Ticket T901049).
-- Nur lesende oder lokal pruefende Aktionen: kein Plan-Staging, keine
-- Hold-Freigabe, kein Statuswechsel aus dem Editor. Mutierende Schritte
-- erscheinen hoechstens als kopierbares Kommando (siehe Runbook).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

local function term(cmd, cwd)
  local ok, sn = pcall(require, 'snacks.terminal')
  if ok and sn then
    sn.open(cmd, { cwd = cwd })
  else
    vim.notify('sdlc: terminal not loaded — run manually: ' .. table.concat(cmd, ' '))
  end
end

function M.ticket_show(cwd)
  vim.ui.input({ prompt = 'Ticket ID: ' }, function(id)
    if id and id ~= '' then
      term({ 'bash', 'scripts/ticket.sh', 'get', '--id', id }, cwd)
    end
  end)
end

function M.ticket_search(cwd)
  vim.ui.input({ prompt = 'Search: ' }, function(q)
    if q and q ~= '' then
      term({ 'bash', 'scripts/ticket.sh', 'list', '--search', q }, cwd)
    end
  end)
end

function M.claims_list(cwd)
  term({ 'bash', 'scripts/agent-lock.sh', 'mine' }, cwd)
end

function M.messages_read(cwd)
  term({ 'bash', 'scripts/agent-msg.sh', 'read', '--unread' }, cwd)
end

function M.plan_lint(cwd)
  vim.ui.input({ prompt = 'Plan file: ' }, function(plan)
    if plan and plan ~= '' then
      term({ 'bash', 'scripts/plan-lint.sh', '--plan', plan }, cwd)
    end
  end)
end

function M.ci_gates(cwd)
  term({ 'bash', '-c', 'task test:changed && task freshness:check && task workspace:validate' }, cwd)
end

function M.cfr_show(cwd)
  term({ 'bash', 'scripts/vda.sh', 'cfr' }, cwd)
end

local ACTIONS = {
  action_mod.new({
    name = 'ticket-show',
    target = 'ticket',
    inputs = { { name = 'id', prompt = 'Ticket ID: ' } },
    effect = function(cwd) M.ticket_show(cwd) end,
  }),
  action_mod.new({
    name = 'ticket-search',
    target = 'ticket',
    inputs = { { name = 'query', prompt = 'Search: ' } },
    effect = function(cwd) M.ticket_search(cwd) end,
  }),
  action_mod.new({ name = 'claims-list', target = 'locks', effect = function(cwd) M.claims_list(cwd) end }),
  action_mod.new({ name = 'messages-read', target = 'messages', effect = function(cwd) M.messages_read(cwd) end }),
  action_mod.new({
    name = 'plan-lint',
    target = 'plan',
    inputs = { { name = 'plan', prompt = 'Plan file: ' } },
    effect = function(cwd) M.plan_lint(cwd) end,
  }),
  action_mod.new({ name = 'ci-gates', target = 'repo', effect = function(cwd) M.ci_gates(cwd) end }),
  action_mod.new({ name = 'cfr-show', target = 'metrics', effect = function(cwd) M.cfr_show(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 't', 's', 'c', 'm', 'p', 'g', 'f' }

dashboard_mod.register('sdlc', {
  title = 'SDLC',
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
