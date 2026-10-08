-- Kapitel Files & Search (T901043 p3, Ticket T901046).
-- Alle Aktionen nutzen das p2-Picker-Plugin (snacks.picker) und den
-- Buffer-Git-Root aus p1. `fd`-Abwesenheit wird zur Laufzeit per
-- executable()-Probe erkannt und faellt auf den dokumentierten
-- Standard zurueck (snacks file finder ohne fd, grep via rg).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')
local gitroot = require('core.gitroot')

local function picker()
  local ok, p = pcall(require, 'snacks.picker')
  if not ok then
    return nil
  end
  return p
end

local function finder_cmd()
  if vim.fn.executable('fd') == 1 then
    return 'fd'
  end
  return 'rg-files'
end

function M.find_file()
  local cwd = gitroot.root()
  if not cwd then
    return
  end
  local p = picker()
  if p == nil then
    vim.notify('files-search: picker not loaded (snacks.picker)', vim.log.levels.WARN)
    return
  end
  p.files({ cwd = cwd, cmd = finder_cmd() })
end

function M.live_grep()
  local cwd = gitroot.root()
  if not cwd then
    return
  end
  local p = picker()
  if p == nil then
    vim.notify('files-search: picker not loaded (snacks.picker)', vim.log.levels.WARN)
    return
  end
  p.grep({ cwd = cwd })
end

function M.buffers()
  local p = picker()
  if p == nil then
    vim.notify('files-search: picker not loaded (snacks.picker)', vim.log.levels.WARN)
    return
  end
  p.buffers()
end

function M.recent()
  local p = picker()
  if p == nil then
    vim.notify('files-search: picker not loaded (snacks.picker)', vim.log.levels.WARN)
    return
  end
  p.recent()
end

function M.related()
  local cwd = gitroot.root()
  if not cwd then
    return
  end
  local p = picker()
  if p == nil then
    vim.notify('files-search: picker not loaded (snacks.picker)', vim.log.levels.WARN)
    return
  end
  p.files({ cwd = cwd, cmd = finder_cmd() })
end

local ACTIONS = {
  action_mod.new({ name = 'find-file', target = 'repo', effect = function() M.find_file() end }),
  action_mod.new({ name = 'live-grep', target = 'repo', effect = function() M.live_grep() end }),
  action_mod.new({ name = 'buffers', target = 'editor', effect = function() M.buffers() end }),
  action_mod.new({ name = 'recent-files', target = 'editor', effect = function() M.recent() end }),
  action_mod.new({ name = 'related-open', target = 'repo', effect = function() M.related() end }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'f', 'g', 'b', 'r', 'o' }

dashboard_mod.register('files-search', {
  title = 'Files & Search',
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
