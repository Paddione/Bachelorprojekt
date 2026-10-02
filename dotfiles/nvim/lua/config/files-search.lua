-- T900657 p1 — Files & Search chapter actions (NEW file).
--
-- No overlap with the thirteen kept core plugins (plugins/core.lua):
-- Telescope provides the pickers (find_files, live_grep, buffers, oldfiles;
-- spec key: cmd 'Telescope'), Snacks provides dashboard/UI only. No new
-- plugin enters the set — this module only *calls* the already-installed
-- pickers through require('telescope.builtin').
--
-- cwd contract: every function resolves cwd at *execution* time via
-- require('config.gitroot').root() and returns early with a WARN when no
-- git root is resolvable (unnamed/non-file buffer or not inside a git
-- checkout). The dashboard action model (config/dashboard.lua) already
-- nil-guards before invoking effects and passes the execution-time cwd, so
-- the functions accept an optional cwd argument and fall back to gitroot
-- when it is nil — never at render time, never touching vim.fn.getcwd().
--
-- Related-file rules (Bachelorprojekt repo layout, verified 2026-09-27):
--   A. dotfiles/nvim/lua/config/<name>.lua  <->  dotfiles/nvim/runbooks/<name>.md
--   B. tests/spec/neovim-<name>.bats        <->  dotfiles/nvim/lua/config/<name>.lua
--      (test <-> source; neovim- prefix stripped for the lookup)
--   C. components/website/src/**/<Name>.astro|svelte  ->  docs/agent-guide/<kebab>.md
--      (PascalCase component name lowercased; existence-checked, best effort)
--   D. docs/**/<kebab>.md  ->  components/website/src/**/<Pascal>.astro|svelte
--      (reverse of C; existence-checked)
-- Candidates are existence-checked under the resolved root; the first hit
-- wins; when nothing matches, a WARN is raised (no guess, no side effect).
--
-- Escaping: file paths passed to :edit / :lcd go through fnameescape();
-- picker calls carry cwd as a Telescope API argument (no shell involved),
-- so no shellescape is needed here. Zero BufWritePre autocmds — no
-- format-on-save, no whitespace rewriting.

local M = {}

local function warn(msg)
  vim.notify('files-search: ' .. msg, vim.log.levels.WARN)
end

--- Execution-time root resolution with nil guard.
--- @return string|nil
local function resolve_cwd(cwd)
  if cwd and cwd ~= '' then
    return cwd
  end
  local root = require('config.gitroot').root()
  if root == nil then
    warn('no project root — open a git-rooted buffer first')
  end
  return root
end

--- Load a telescope.builtin picker, guarded (telescope is lazy: cmd).
--- @param name string
--- @return function|nil
local function picker(name)
  local ok, builtin = pcall(require, 'telescope.builtin')
  if not ok then
    warn('telescope not loaded (try :Telescope once, then retry — spec cmd "Telescope", T900655)')
    return nil
  end
  local fn = builtin[name]
  if type(fn) ~= 'function' then
    warn(string.format('telescope.builtin.%s unavailable in installed version', name))
    return nil
  end
  return fn
end

--- Files by name under the project root (hidden shown, .git respected via
--- the default vimgrep/fd/ripgrep behaviour of Telescope).
--- @param cwd string|nil execution-time cwd (optional)
function M.find_file(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local fn = picker('find_files')
  if not fn then return end
  fn({ cwd = cwd, hidden = true })
end

--- Live grep (ripgrep) under the project root. Default <C-q> send-to-
--- quickfix mapping is preserved; M.send_to_quickfix() is exposed as the
--- explicit helper for the same purpose.
--- @param cwd string|nil
function M.live_grep(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local fn = picker('live_grep')
  if not fn then return end
  fn({ cwd = cwd })
end

--- Open buffers filtered to the project root where Telescope supports the
--- cwd filter (otherwise all open buffers are listed).
--- @param cwd string|nil
function M.buffers(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local fn = picker('buffers')
  if not fn then return end
  fn({ cwd = cwd })
end

--- Recently used files (Telescope oldfiles) filtered to paths under the
--- project root.
--- @param cwd string|nil
function M.recent(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local fn = picker('oldfiles')
  if not fn then return end
  fn({ cwd = cwd, only_cwd = true })
end

--- Send picker results to the quickfix list (explicit counterpart of the
--- preserved <C-q> mapping in live_grep).
--- @param results table[] list of { filename, lnum, col?, text? }
function M.send_to_quickfix(results)
  local items = {}
  for _, r in ipairs(results or {}) do
    items[#items + 1] = {
      filename = r.filename or '',
      lnum = r.lnum or 1,
      col = r.col or 1,
      text = r.text or '',
    }
  end
  vim.fn.setqflist({}, 'r', { items = items })
  vim.cmd('copen')
end

--- Human-readable related-file rules, mirrored from the module header.
--- Each entry: { match = function(rel) -> string|nil a candidate rel path }.
--- The first candidate that exists under the root is opened.
local RELATED_RULES = {}

-- A: config module <-> runbook
local function rule_config_runbook(rel)
  return rel:match('^dotfiles/nvim/lua/config/([%w_%-]+)%.lua$')
      and ('dotfiles/nvim/runbooks/' .. rel:match('^dotfiles/nvim/lua/config/([%w_%-]+)%.lua$') .. '.md')
      or nil
end
-- B: neovim-<name>.bats <-> config/<name>.lua (both directions)
local function rule_bats_to_config(rel)
  local stem = rel:match('^tests/spec/neovim%-([%w_%-]+)%.bats$')
  return stem and ('dotfiles/nvim/lua/config/' .. stem .. '.lua') or nil
end
local function rule_config_to_bats(rel)
  local stem = rel:match('^dotfiles/nvim/lua/config/([%w_%-]+)%.lua$')
  return stem and ('tests/spec/neovim-' .. stem .. '.bats') or nil
end
-- C/D: component <-> agent-guide doc (PascalCase <-> kebab-case slug)
local function rule_component_to_doc(rel)
  local name = rel:match('^components/website/src/[^%s]*/([%w_%-]+)%.(astro|svelte)$')
  if not name then return nil end
  local slug = name:gsub('(%u)', function(c) return '-' .. c:lower() end):gsub('^%-', ''):lower()
  return slug ~= '' and ('docs/agent-guide/' .. slug .. '.md') or nil
end
local function rule_doc_to_component(rel)
  if not rel:match('^docs/agent-guide/([%w_%-]+)%.md$') then return nil end
  local slug = rel:match('^docs/agent-guide/([%w_%-]+)%.md$')
  local pascal = slug:gsub('%-([%w])', function(c) return c:upper() end):gsub('^%l', string.upper)
  return ('components/website/src/components/' .. pascal .. '.astro')
end

RELATED_RULES = {
  { from = rule_config_runbook, desc = 'config module -> runbook' },
  { from = rule_bats_to_config, desc = 'bats test -> config module' },
  { from = rule_config_to_bats, desc = 'config module -> bats test' },
  { from = rule_component_to_doc, desc = 'component -> agent-guide doc' },
  { from = rule_doc_to_component, desc = 'agent-guide doc -> component' },
}

--- Open the file related to the current buffer. Rules are repo-layout
--- derived (see header); existence-checked candidates only, first hit wins.
--- @param cwd string|nil
function M.related(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local bufpath = vim.api.nvim_buf_get_name(0)
  if bufpath == '' then
    warn('no relation (unnamed buffer)')
    return
  end
  local abs = vim.fn.fnamemodify(bufpath, ':p')
  local rel = abs
  if vim.startswith(abs, cwd) then
    rel = abs:sub(#cwd + 2) -- strip '<root>/' prefix
  end
  local seen = {}
  for _, rule in ipairs(RELATED_RULES) do
    local candidate = rule.from(rel)
    if candidate and not seen[candidate] then
      seen[candidate] = true
      local full = cwd .. '/' .. candidate
      if vim.loop.fs_stat(full) then
        vim.cmd.edit(vim.fn.fnameescape(full))
        return
      end
    end
  end
  warn(string.format('no related file for %s (tried %d rule(s))', rel, #RELATED_RULES))
end

return M
