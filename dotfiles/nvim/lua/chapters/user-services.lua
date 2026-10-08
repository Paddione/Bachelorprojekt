-- Kapitel User Services (T901043 p8, Ticket T901058 Teil 2).
-- Aus der Live-Config uebernommen (nur dort existent, K11); die hart
-- codierte Hersteller-Sortierung ist entfernt — rein alphabetisch.
-- Start/Stop/Restart nur nach expliziter Auswahl (Bestaetigungsdialog des
-- Aktionsmodells + Auswahl der Unit).
local M = {}

local dashboard_mod = require('core.dashboard')
local action_mod = require('core.actions')

local function distro()
  return (vim.g.neovim_config_source or ''):match('wsl%.localhost\\([^\\]+)')
end

function M.command(args)
  if vim.fn.has('win32') == 1 then
    local d = distro()
    assert(d, 'Cannot determine WSL distribution from neovim_config_source')
    local cmd = { 'wsl.exe', '--distribution', d, '--exec', 'sh', '-c',
      'export XDG_RUNTIME_DIR=/run/user/$(id -u); exec "$@"', 'user-services' }
    vim.list_extend(cmd, args)
    return cmd, {}
  end
  return args, { XDG_RUNTIME_DIR = '/run/user/' .. vim.uv.getuid() }
end

local function run(args)
  local cmd, env = M.command(args)
  return vim.system(cmd, { text = true, env = env, timeout = 10000 }):wait()
end

local function show(title, result)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false,
    vim.split(title .. '\n\n' .. (result.stdout or '') .. (result.stderr or ''), '\n', { plain = true }))
  vim.bo[buf].bufhidden = 'wipe'
  vim.bo[buf].modifiable = false
  vim.cmd('botright split')
  vim.api.nvim_win_set_buf(0, buf)
end

--- Units alphabetisch (K11-Sortierung ohne hart codierte Namen).
function M.units()
  local r = run({ 'systemctl', '--user', 'list-unit-files', '--type=service', '--no-legend', '--no-pager' })
  assert(r.code == 0, r.stderr or 'Cannot list services')
  local units = {}
  for line in (r.stdout or ''):gmatch('[^\n]+') do
    local name, enabled = line:match('^(%S+)%s+(%S+)')
    if name then
      units[#units + 1] = { name = name, enabled = enabled }
    end
  end
  table.sort(units, function(a, b)
    return a.name < b.name
  end)
  return units
end

function M.edit(unit)
  local r = run({ 'systemctl', '--user', 'show', unit, '--property=FragmentPath', '--value' })
  local path = vim.trim(r.stdout or '')
  if r.code ~= 0 or path == '' then
    show('Cannot locate ' .. unit, r)
    return
  end
  if vim.fn.has('win32') == 1 then
    path = '\\\\wsl.localhost\\' .. distro() .. path:gsub('/', '\\')
  end
  vim.cmd.edit(vim.fn.fnameescape(path))
  vim.notify('Editing installed unit. Save, then choose reload definitions; restart separately to apply.')
end

local function with_unit(verb, cwd)
  local ok, units = pcall(M.units)
  if not ok then
    vim.notify(tostring(units), vim.log.levels.ERROR)
    return
  end
  vim.ui.select(units, {
    prompt = 'User service (' .. verb .. ', bestaetigt):',
    format_item = function(u)
      return u.name .. ' [' .. u.enabled .. ']'
    end,
  }, function(unit)
    if not unit then
      return
    end
    local r = run({ 'systemctl', '--user', verb, unit.name, '--no-pager' })
    show(unit.name .. ' — ' .. verb, r)
  end)
end

function M.service_list(cwd)
  local ok, units = pcall(M.units)
  if not ok then
    vim.notify(tostring(units), vim.log.levels.ERROR)
    return
  end
  local names = {}
  for _, u in ipairs(units) do
    names[#names + 1] = u.name .. ' [' .. u.enabled .. ']'
  end
  vim.notify(table.concat(names, '\n'))
end

function M.service_start(cwd)
  with_unit('start', cwd)
end

function M.service_stop(cwd)
  with_unit('stop', cwd)
end

function M.service_restart(cwd)
  with_unit('restart', cwd)
end

function M.unit_open(cwd)
  local ok, units = pcall(M.units)
  if not ok then
    vim.notify(tostring(units), vim.log.levels.ERROR)
    return
  end
  vim.ui.select(units, {
    prompt = 'Unit-Datei oeffnen:',
    format_item = function(u)
      return u.name .. ' [' .. u.enabled .. ']'
    end,
  }, function(unit)
    if unit then
      M.edit(unit.name)
    end
  end)
end

local ACTIONS = {
  action_mod.new({ name = 'service-list', target = 'unit', effect = function(cwd) M.service_list(cwd) end }),
  action_mod.new({
    name = 'service-start',
    target = 'unit',
    inputs = { { name = 'unit', prompt = 'Unit: ' } },
    effect = function(cwd) M.service_start(cwd) end,
  }),
  action_mod.new({
    name = 'service-stop',
    target = 'unit',
    inputs = { { name = 'unit', prompt = 'Unit: ' } },
    effect = function(cwd) M.service_stop(cwd) end,
  }),
  action_mod.new({
    name = 'service-restart',
    target = 'unit',
    inputs = { { name = 'unit', prompt = 'Unit: ' } },
    effect = function(cwd) M.service_restart(cwd) end,
  }),
  action_mod.new({
    name = 'unit-open',
    target = 'unit',
    inputs = { { name = 'unit', prompt = 'Unit: ' } },
    effect = function(cwd) M.unit_open(cwd) end,
  }),
}

function M.actions()
  local names = {}
  for _, a in ipairs(ACTIONS) do
    names[#names + 1] = a.name
  end
  return names
end

local KEYS = { 'l', 's', 't', 'r', 'o' }

dashboard_mod.register('user-services', {
  title = 'User Services',
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
