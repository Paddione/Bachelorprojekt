-- Kapitel JavaScript / Frontend (T901043 p4, Ticket T901047).
-- Komponenten-Erkennung und Paketmanager-Wahl laufen zur Laufzeit
-- (package.json-Scan ab Projekt-Root); Befehle je Komponente werden via
-- `bash scripts/vda.sh oracle` ermittelt (Schritt im Runbook), nicht hart
-- codiert. Kein format-on-save. Unbekannte Komponenten erscheinen mit
-- Diagnose statt zu schweigen.
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

--- Komponenten zur Laufzeit ermitteln: Verzeichnisse mit package.json
--- unterhalb der Projekt-Root (website, brett, VideoVault, studio-server,
--- mentolder-web, mediaviewer-widget, packages/* u.a.).
function M.components()
  local root = project_root()
  local found = {}
  local seen = {}
  local candidates = {
    'website',
    'components/website',
    'components/brett',
    'components/VideoVault',
    'components/studio-server',
    'components/mentolder-web',
    'components/mediaviewer-widget',
    'packages/videovault-player',
  }
  for _, rel in ipairs(candidates) do
    if vim.fn.filereadable(root .. '/' .. rel .. '/package.json') == 1 and not seen[rel] then
      seen[rel] = true
      found[#found + 1] = rel
    end
  end
  local glob = vim.fn.glob(root .. '/packages/*/package.json', false, true)
  for _, path in ipairs(glob) do
    local rel = path:sub(#root + 2, -#'/package.json' - 1)
    if not seen[rel] then
      seen[rel] = true
      found[#found + 1] = rel
    end
  end
  return found
end

--- Paketmanager je Komponente live pruefen (website: pnpm, Rest: npm).
function M.manager(component)
  local root = project_root()
  if component == 'website' or component == 'components/website' then
    if vim.fn.filereadable(root .. '/' .. component .. '/pnpm-lock.yaml') == 1 then
      return 'pnpm'
    end
    return 'pnpm?'
  end
  if vim.fn.filereadable(root .. '/' .. component .. '/package-lock.json') == 1 then
    return 'npm'
  end
  return 'npm?'
end

local function run_task(component, kind)
  local comps = M.components()
  local known = false
  for _, c in ipairs(comps) do
    if c == component then
      known = true
    end
  end
  if not known then
    vim.notify(
      'js-frontend: unknown component "' .. component .. '" (known: ' .. table.concat(comps, ', ') .. ')',
      vim.log.levels.WARN
    )
    return
  end
  vim.notify('js-frontend: run "' .. kind .. '" in ' .. component .. ' via oracle-resolved command (see runbook)')
end

local KINDS = { 'dev', 'test', 'lint', 'build' }

local ACTIONS = {}
for i, kind in ipairs(KINDS) do
  ACTIONS[i] = action_mod.new({
    name = kind,
    target = 'js-component',
    inputs = { { name = 'component', prompt = 'Component: ' } },
    effect = function(cwd)
      vim.ui.input({ prompt = 'Component: ' }, function(component)
        if component and component ~= '' then
          run_task(component, kind)
        end
      end)
    end,
  })
end

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'd', 't', 'l', 'b' }

dashboard_mod.register('js-frontend', {
  title = 'JavaScript / Frontend',
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
