-- Dashboard-Shell: Home, Kategorieseiten, Zurueck-Navigation (T901043 p1).
-- Kapitel registrieren sich per register(name, page); kein Monolith.
-- Bauen, Fokussieren und Suchen sind seitenffektfrei (kein effect-Aufruf,
-- kein notify ohne Snacks); nur der explizite Ausfuehren-Schritt
-- (core.actions.run) ruft effects auf.
local M = {}

local ids = {}
local by_id = {}

--- Register a chapter page. Called by chapters/* on require.
--- spec = { title = string, parent = string?, rows = function -> action rows }
function M.register(id, spec)
  assert(type(id) == 'string' and id ~= '', 'page id required')
  assert(type(spec) == 'table' and type(spec.title) == 'string', 'page spec needs a title')
  assert(type(spec.rows) == 'function', 'page spec needs a rows function')
  if not by_id[id] then
    ids[#ids + 1] = id
  end
  by_id[id] = spec
end

--- Page ids in registration order.
function M.pages()
  local out = {}
  for _, id in ipairs(ids) do
    out[#out + 1] = id
  end
  return out
end

function M.page(id)
  return by_id[id]
end

--- Action rows of a page, in dashboard order (no header/nav decorations).
function M.action_rows(id)
  local spec = assert(by_id[id], 'Unknown dashboard page: ' .. tostring(id))
  return spec.rows()
end

--- Chapter titles for the Home page, in registration order.
function M.home_titles()
  local out = {}
  for _, id in ipairs(ids) do
    if id ~= 'home' then
      out[#out + 1] = by_id[id].title
    end
  end
  return out
end

local function snacks()
  local ok, s = pcall(require, 'snacks')
  if not ok then
    return nil
  end
  return s
end

--- Show a page. Without the Snacks UI this is a silent no-op returning
--- the page descriptor (headless-safe: focusing never executes, never
--- notifies).
function M.show(page)
  page = page or 'home'
  local spec = by_id[page]
  if not spec then
    return nil
  end
  local s = snacks()
  if s == nil then
    return { page = page }
  end
  local ok, opened = pcall(s.dashboard, { win = 0 })
  if not ok then
    return { page = page }
  end
  opened.page = page
  return opened
end

--- Focus (never execute) a search-picked item. Returns { page, row? }.
--- @param item table|nil { text, page, key? }
function M.focus(item)
  if not item then
    return nil
  end
  local shown = M.show(item.page)
  if shown == nil then
    return nil
  end
  if item.key and shown.win and vim.api.nvim_win_is_valid(shown.win) then
    for _, row in ipairs(shown.items or {}) do
      if row.key == item.key and row._ then
        pcall(vim.api.nvim_win_set_cursor, shown.win, { row._.row, row._.col })
        return { page = item.page, row = row._.row }
      end
    end
  end
  if item.key then
    local rows = M.action_rows(item.page)
    for i, row in ipairs(rows) do
      if row.key == item.key then
        return { page = item.page, row = i }
      end
    end
  end
  return { page = item.page }
end

--- Search over page titles and action names. Selecting a hit only
--- focuses it (M.focus); execution stays a separate explicit step.
--- Returns the item list (headless-safe).
function M.search()
  local items = {}
  for _, id in ipairs(ids) do
    local spec = by_id[id]
    items[#items + 1] = { text = spec.title, page = id }
    local ok, rows = pcall(spec.rows)
    if ok then
      for _, row in ipairs(rows) do
        if type(row) == 'table' and row.name and row.key then
          items[#items + 1] = { text = row.name, page = id, key = row.key }
        end
      end
    end
  end
  local s = snacks()
  if s == nil or s.picker == nil then
    return items
  end
  local ok = pcall(s.picker.pick, {
    source = 'dashboard-search',
    items = items,
    format = function(item)
      return { { item.text } }
    end,
    confirm = function(picker, item)
      picker:close()
      M.focus(item)
    end,
  })
  if not ok then
    return items
  end
  return items
end

function M.setup()
  vim.api.nvim_create_user_command('Dashboard', function()
    M.show('home')
  end, { desc = 'Open the shared table of contents' })
  vim.api.nvim_create_user_command('DashboardSearch', function()
    M.search()
  end, { desc = 'Search dashboard categories and actions' })
  vim.keymap.set('n', '<leader>h', '<cmd>Dashboard<CR>', { desc = 'Dashboard', silent = true })
  vim.keymap.set('n', '<leader>hf', '<cmd>DashboardSearch<CR>', { desc = 'Dashboard search', silent = true })
  vim.api.nvim_create_autocmd('VimEnter', {
    once = true,
    callback = function()
      if vim.g.dashboard_startup == 0 or vim.g.dashboard_startup == false then
        return
      end
      if vim.fn.argc() > 0 or vim.bo.buftype ~= '' then
        return
      end
      vim.schedule(function()
        pcall(M.show, 'home')
      end)
    end,
  })
end

-- Registration order = Home order (SSOT; runbooks/index.md spiegelt sie).
local CHAPTERS = {
  'editor',
  'files-search',
  'js-frontend',
  'github',
  'sdlc',
  'repo-knowledge',
  'ai-agents',
  'models-inference',
  'comfyui-images',
  'ml-training',
  'infrastructure',
  'mcp-servers',
  'user-services',
  'tests-plans',
  'settings-help',
}

--- Load and register every chapter (call once from init.lua).
function M.setup_chapters()
  local missing = {}
  for _, name in ipairs(CHAPTERS) do
    local ok, err = pcall(require, 'chapters.' .. name)
    if not ok then
      missing[#missing + 1] = name .. ': ' .. tostring(err)
    end
  end
  if #missing > 0 then
    error('dashboard chapter registration failed:\n' .. table.concat(missing, '\n'))
  end
  return M.pages()
end

return M
