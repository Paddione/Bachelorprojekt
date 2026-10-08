-- Kapitel GitHub (T901043 p5, Ticket T901048).
-- Anzeige via gh-axi, maschinelles Parsen via gh direkt (T004612).
-- KEINE Abschluss-Aktion per Knopfdruck: das Zusammenfuehren geschieht
-- ausschliesslich ueber den automatischen Ablauf nach gruenen Checks
-- (K3-Aktion ersatzlos gestrichen).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

local function term(cmd, cwd)
  local ok, sn = pcall(require, 'snacks.terminal')
  if ok and sn then
    sn.open(cmd, { cwd = cwd })
  else
    vim.notify('github: terminal not loaded — run manually: ' .. table.concat(cmd, ' '))
  end
end

function M.pr_view(cwd)
  term({ 'gh-axi', 'pr', 'view' }, cwd)
end

function M.pr_comments(cwd)
  term({ 'gh', 'pr', 'view', '--comments' }, cwd)
end

function M.pr_checks(cwd)
  term({ 'gh', 'pr', 'checks' }, cwd)
end

function M.failure_logs(cwd)
  term({ 'gh', 'run', 'list', '--status', 'failure', '--limit', '5' }, cwd)
end

function M.release_view(cwd)
  term({ 'gh-axi', 'release', 'view' }, cwd)
end

local ACTIONS = {
  action_mod.new({ name = 'pr-view', target = 'pr', effect = function(cwd) M.pr_view(cwd) end }),
  action_mod.new({ name = 'pr-comments', target = 'pr', effect = function(cwd) M.pr_comments(cwd) end }),
  action_mod.new({ name = 'pr-checks', target = 'pr', effect = function(cwd) M.pr_checks(cwd) end }),
  action_mod.new({ name = 'failure-logs', target = 'ci', effect = function(cwd) M.failure_logs(cwd) end }),
  action_mod.new({ name = 'release-view', target = 'release', effect = function(cwd) M.release_view(cwd) end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'p', 'o', 'c', 'l', 'v' }

dashboard_mod.register('github', {
  title = 'GitHub',
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
