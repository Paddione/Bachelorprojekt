-- Snacks dashboard shell — home / category / sub-page / back (T900655).
-- Opening a menu never executes anything: rendering and link traversal run
-- no shell commands, no file writes, no state changes beyond the buffer.
local M = {}

local function link(key, desc, page)
  return { key = key, desc = desc .. '  >', action = function(dashboard) M.show(page, dashboard) end }
end

--- Build a visible-action-model item. The action model's fields are all
--- present on the returned table: name, inputs, target/effect, cwd (resolved
--- at execution time, never at render time), and on_error.
--- @param spec table { name, inputs, effect, on_error }
local function action(spec)
  return {
    key = spec.key,
    desc = spec.name,
    name = spec.name,
    inputs = spec.inputs or {},
    effect = spec.effect,
    on_error = spec.on_error,
    action = function()
      local cwd = require('config.gitroot').root()
      if cwd == nil then
        vim.notify('dashboard: no project — action needs a git-rooted buffer', vim.log.levels.WARN)
        if spec.on_error then spec.on_error() end
        return
      end
      local ok, err = pcall(spec.effect, cwd, spec.inputs or {})
      if not ok then
        vim.notify('dashboard: action failed: ' .. tostring(err), vim.log.levels.ERROR)
        if spec.on_error then spec.on_error() end
      end
    end,
  }
end

-- Fixed EPIC chapter order (design.md section 6). No Factory chapter.
local CHAPTERS = {
  { key = '1', title = 'Files & Search', page = 'files-search' },
  { key = '2', title = 'JavaScript / Frontend', page = 'js-frontend' },
  { key = '3', title = 'GitHub', page = 'github' },
  { key = '4', title = 'SDLC', page = 'sdlc' },
  { key = '5', title = 'Repository & Code Knowledge', page = 'repo-knowledge' },
  { key = '6', title = 'AI & Agents', page = 'ai-agents' },
  { key = '7', title = 'Models & Inference', page = 'models-inference' },
  { key = '8', title = 'Infrastructure', page = 'infrastructure' },
  { key = '9', title = 'ComfyUI & Images', page = 'comfyui-images' },
  { key = '0', title = 'Settings & Help', page = 'settings-help' },
}

local function stub_rows(title)
  return {
    { desc = title .. ': Kapitel-Inhalt folgt mit seinem eigenen Ticket (Stub).' },
  }
end

local pages = {
  home = {
    title = 'Inhaltsverzeichnis',
    rows = function()
      local rows = {}
      for _, chapter in ipairs(CHAPTERS) do
        rows[#rows + 1] = link(chapter.key, chapter.title, chapter.page)
      end
      return rows
    end,
  },
  -- Infrastructure is the one chapter that demonstrates a reachable
  -- sub-page and one example executable action for this foundation
  -- partial; its real content arrives with its own chapter ticket.
  infrastructure = {
    title = 'Infrastructure',
    rows = function()
      local rows = stub_rows('Infrastructure')
      rows[#rows + 1] = link('s', 'Status', 'infrastructure-status')
      return rows
    end,
  },
  ['infrastructure-status'] = {
    title = 'Infrastructure · Status',
    parent = 'infrastructure',
    rows = function()
      return {
        action({
          key = 'g',
          name = 'Show current buffer git root',
          inputs = {},
          effect = function(cwd)
            vim.notify('git root: ' .. cwd, vim.log.levels.INFO)
          end,
          on_error = function() end,
        }),
      }
    end,
  },
}

for _, chapter in ipairs(CHAPTERS) do
  if pages[chapter.page] == nil then
    pages[chapter.page] = {
      title = chapter.title,
      rows = function() return stub_rows(chapter.title) end,
    }
  end
end

function M.sections(page, parent)
  local spec = assert(pages[page], 'Unknown dashboard page: ' .. tostring(page))
  local rows = {
    { text = { 'NEOVIM  /  ' .. spec.title, hl = 'SnacksDashboardHeader' }, padding = 1 },
    { desc = 'j/k oder Pfeiltasten + Enter  |  direkte Auswahl per Taste', padding = 1 },
    spec.rows(),
  }
  if page ~= 'home' then
    rows[#rows + 1] = { padding = 1 }
    rows[#rows + 1] = link('0', 'Inhaltsverzeichnis', 'home')
    local back = link('<BS>', 'Zurueck', parent or spec.parent or 'home')
    back.hidden = true
    rows[#rows + 1] = back
    rows[#rows + 1] = { desc = 'Backspace: zurueck  |  0: Inhaltsverzeichnis' }
  end
  rows[#rows + 1] = { key = 'q', desc = 'Neovim beenden', action = ':qa' }
  return rows
end

function M.show(page, dashboard)
  page = page or 'home'
  local parent = dashboard and dashboard.page or nil
  local sections = M.sections(page, parent)
  if dashboard and dashboard.win and vim.api.nvim_win_is_valid(dashboard.win) then
    for _, old in ipairs(dashboard.items or {}) do
      if old.key then pcall(vim.keymap.del, 'n', old.key, { buffer = dashboard.buf }) end
    end
    dashboard.opts.sections = sections
    dashboard.page = page
    dashboard:update()
    vim.api.nvim_win_set_cursor(dashboard.win, { 1, 0 })
    return dashboard
  end
  local opened = Snacks.dashboard({ win = 0, sections = sections })
  opened.page = page
  return opened
end

--- Focus (not execute) the first search match: open its page and move the
--- cursor to it. Execution stays a separate, explicit step (Enter on the
--- focused item).
function M.search()
  local items = {}
  for page, spec in pairs(pages) do
    items[#items + 1] = { text = spec.title, page = page }
  end
  Snacks.picker.pick({
    source = 'dashboard-search',
    items = items,
    format = function(item) return { { item.text } } end,
    confirm = function(picker, item)
      picker:close()
      if item then M.show(item.page) end
    end,
  })
end

function M.setup()
  vim.api.nvim_create_user_command('Dashboard', function() M.show('home') end,
    { desc = 'Open the shared table of contents' })
  vim.keymap.set('n', '<leader>h', '<cmd>Dashboard<CR>', { desc = 'Dashboard', silent = true })
end

return M
