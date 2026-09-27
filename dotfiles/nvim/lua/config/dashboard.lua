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
  -- Files & Search chapter page (T900657). Rows are action() records in the
  -- exact EPIC order; each effect resolves cwd at execution time through the
  -- dashboard action model and passes it to the matching files-search module
  -- function (which nil-guards and degrades gracefully when no git root).
  ['files-search'] = {
    title = 'Files & Search',
    rows = function()
      return {
        action({
          key = 'f',
          name = 'find-file',
          inputs = {},
          effect = function(cwd) require('config.files-search').find_file(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'g',
          name = 'live-grep',
          inputs = {},
          effect = function(cwd) require('config.files-search').live_grep(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'b',
          name = 'buffers',
          inputs = {},
          effect = function(cwd) require('config.files-search').buffers(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'r',
          name = 'recent-files',
          inputs = {},
          effect = function(cwd) require('config.files-search').recent(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'o',
          name = 'related-open',
          inputs = {},
          effect = function(cwd) require('config.files-search').related(cwd) end,
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

-- Exported so runbook-coverage tooling/tests can enumerate every page and
-- sub-page (not just the ten Home chapters) without duplicating the page
-- tree (F5). Read-only by convention: callers must not mutate this table.
M.pages = pages

-- The back target is always the page's own static parent (design: fixed
-- page tree), never the dynamically last-shown page. A dynamic parent lets
-- a detour (e.g. Home -> Infrastructure -> Status -> back -> Infrastructure
-- -> back) land back on Status instead of Infrastructure/Home, and Home
-- becomes unreachable via repeated <BS> (F3).
function M.sections(page)
  local spec = assert(pages[page], 'Unknown dashboard page: ' .. tostring(page))
  local rows = {
    { text = { 'NEOVIM  /  ' .. spec.title, hl = 'SnacksDashboardHeader' }, padding = 1 },
    { desc = 'j/k oder Pfeiltasten + Enter  |  direkte Auswahl per Taste', padding = 1 },
    spec.rows(),
  }
  if page ~= 'home' then
    rows[#rows + 1] = { padding = 1 }
    rows[#rows + 1] = link('0', 'Inhaltsverzeichnis', 'home')
    local back = link('<BS>', 'Zurueck', spec.parent or 'home')
    back.hidden = true
    rows[#rows + 1] = back
    rows[#rows + 1] = { desc = 'Backspace: zurueck  |  0: Inhaltsverzeichnis' }
  end
  rows[#rows + 1] = { key = 'q', desc = 'Neovim beenden', action = ':qa' }
  return rows
end

-- The dashboard window currently open, if any — tracked so search can
-- reuse/update it instead of always opening a second one.
local current

function M.show(page, dashboard)
  page = page or 'home'
  dashboard = dashboard or current
  local sections = M.sections(page)
  if dashboard and dashboard.win and vim.api.nvim_win_is_valid(dashboard.win) then
    for _, old in ipairs(dashboard.items or {}) do
      if old.key then pcall(vim.keymap.del, 'n', old.key, { buffer = dashboard.buf }) end
    end
    dashboard.opts.sections = sections
    dashboard.page = page
    dashboard:update()
    vim.api.nvim_win_set_cursor(dashboard.win, { 1, 0 })
    current = dashboard
    return dashboard
  end
  local opened = Snacks.dashboard({ win = 0, sections = sections })
  opened.page = page
  current = opened
  return opened
end

-- Every executable row (from action()) across every page, keyed by owning
-- page and row key, so search can index actions, not just page titles.
local function collect_action_items()
  local items = {}
  for page, spec in pairs(pages) do
    local ok, rows = pcall(spec.rows)
    if ok then
      for _, row in ipairs(rows) do
        if type(row) == 'table' and row.name and row.key then
          items[#items + 1] = { text = row.name, page = page, key = row.key }
        end
      end
    end
  end
  return items
end

--- Focus (never execute) a search-picked item: open its page and, for an
--- action item, move the cursor to that action's rendered row. Execution
--- stays a separate, explicit step (Enter on the focused item). Public so
--- both the real picker's confirm callback and tests can drive it directly.
--- @param item table|nil { text, page, key? }
function M.focus(item)
  if not item then return nil end
  local dashboard = M.show(item.page)
  if item.key and dashboard and dashboard.win and vim.api.nvim_win_is_valid(dashboard.win) then
    for _, row in ipairs(dashboard.items or {}) do
      if row.key == item.key and row._ then
        vim.api.nvim_win_set_cursor(dashboard.win, { row._.row, row._.col })
        break
      end
    end
  end
  return dashboard
end

--- Search over category (page) names and action names. Selecting a hit
--- only focuses it (M.focus); execution is a separate explicit step.
function M.search()
  local items = collect_action_items()
  for page, spec in pairs(pages) do
    items[#items + 1] = { text = spec.title, page = page }
  end
  Snacks.picker.pick({
    source = 'dashboard-search',
    items = items,
    format = function(item) return { { item.text } } end,
    confirm = function(picker, item)
      picker:close()
      M.focus(item)
    end,
  })
end

function M.setup()
  vim.api.nvim_create_user_command('Dashboard', function() M.show('home') end,
    { desc = 'Open the shared table of contents' })
  vim.api.nvim_create_user_command('DashboardSearch', function() M.search() end,
    { desc = 'Search dashboard categories and actions' })
  vim.keymap.set('n', '<leader>h', '<cmd>Dashboard<CR>', { desc = 'Dashboard', silent = true })
  vim.keymap.set('n', '<leader>hf', '<cmd>DashboardSearch<CR>', { desc = 'Dashboard search', silent = true })
end

return M
