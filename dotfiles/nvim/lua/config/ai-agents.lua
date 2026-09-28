-- T900662 p1 — AI & Agents chapter actions (NEW file).
--
-- No-new-plugin inventory (verified live 2026-09-28): every checklist
-- capability is already covered by kept plugins in plugins/core.lua, so no
-- new plugin enters the set — this module only *calls* the installed APIs:
--   * nickjvandyke/opencode.nvim — ask()/select()/prompt()/command() for
--     prompt input, the prompt/command/server picker, context injection and
--     session lifecycle; context placeholders @this/@buffer/@buffers/
--     @diagnostics/@marks/@quickfix/@visible; built-in prompts (diagnostics,
--     document, explain, fix, implement, optimize, review, test); session
--     commands (session.new/select/compact/interrupt/undo/redo/share);
--     health via :checkhealth opencode; server discovery via `opencode
--     --port` (opencode CLI v2.0.18).
--   * folke/snacks.nvim — dashboard shell and picker UI only.
--   * nvim-telescope/telescope.nvim — pickers (unused by this chapter, kept
--     for the files-search chapter).
--   * akinsho/toggleterm.nvim — terminal sessions (server fallback target).
-- Human typing completion stays in blink.cmp (setup_blink() in
-- config/editor-capabilities.lua) with no agent wiring; agents navigate
-- through opencode.nvim tools, never through Blink.
--
-- cwd contract: every function resolves cwd at *execution* time via
-- require('config.gitroot').root() and returns early with a WARN when no
-- git root is resolvable. The dashboard action model (config/dashboard.lua)
-- nil-guards before invoking effects and passes the execution-time cwd, so
-- the functions accept an optional cwd argument and fall back to gitroot
-- when it is nil — never at render time, never touching vim.fn.getcwd().
--
-- Escaping: process calls use argv lists only (vim.system, no shell string
-- building); the skills scratch buffer is addressed by buffer number, so no
-- shellescape/fnameescape is needed here. Zero BufWritePre autocmds — no
-- format-on-save, no whitespace rewriting.

local M = {}

local function warn(msg)
  vim.notify('ai-agents: ' .. msg, vim.log.levels.WARN)
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

--- Load the opencode.nvim public API, guarded (the plugin lazily
--- bootstraps its server connection on first use).
--- @return table|nil
local function opencode()
  local ok, oc = pcall(require, 'opencode')
  if not ok then
    warn('opencode.nvim not loaded (run :checkhealth opencode, then retry)')
    return nil
  end
  return oc
end

--- Prompt input for OpenCode, pre-filled with @this context (range or
--- selection when present, else cursor position). <Up> browses recent asks.
--- @param cwd string|nil execution-time cwd (optional)
function M.ask(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local oc = opencode()
  if not oc then return end
  oc.ask('@this: ')
end

--- Picker over OpenCode prompts, commands and servers (snacks.picker UI
--- with highlights and previews).
--- @param cwd string|nil execution-time cwd (optional)
function M.select(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local oc = opencode()
  if not oc then return end
  oc.select()
end

--- Append buffer + diagnostics context to the OpenCode session. The
--- trailing space is significant: opencode.nvim appends the prompt instead
--- of replacing the input (a trailing "..." would open ask() instead).
--- Verified context placeholders (opencode.nvim README): @this (range /
--- selection, else cursor), @buffer (current buffer), @buffers (open
--- buffers), @diagnostics (range diagnostics, else buffer diagnostics),
--- @marks (global marks), @quickfix (quickfix list), @visible (visible
--- text).
--- @param cwd string|nil execution-time cwd (optional)
function M.send_context(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local oc = opencode()
  if not oc then return end
  oc.prompt('@buffer @diagnostics ')
end

--- Show the live agent skills in a read-only scratch buffer. Source is the
--- muse CLI (argv list, no shell): `muse skills list --source all`.
--- @param cwd string|nil execution-time cwd (optional)
function M.list_skills(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  if vim.fn.executable('muse') ~= 1 then
    warn('muse CLI not found on PATH — install it or fix PATH')
    return
  end
  local ok, result = pcall(function()
    return vim.system({ 'muse', 'skills', 'list', '--source', 'all' }, { cwd = cwd, text = true }):wait()
  end)
  if not ok or result == nil or result.code ~= 0 then
    warn('muse skills list failed (exit ' .. tostring(result and result.code or '?') .. ')')
    return
  end
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(result.stdout or '', '\n'))
  vim.api.nvim_set_option_value('readonly', true, { buf = buf })
  vim.api.nvim_set_option_value('modifiable', false, { buf = buf })
  vim.api.nvim_set_option_value('filetype', 'muse-skills', { buf = buf })
  vim.cmd.split()
  vim.api.nvim_win_set_buf(0, buf)
end

--- Start a new OpenCode session (session.new command). Further lifecycle
--- commands (select/compact/interrupt/undo/redo/share) are reachable
--- through M.select()'s picker.
--- @param cwd string|nil execution-time cwd (optional)
function M.session_new(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local oc = opencode()
  if not oc then return end
  oc.command('session.new')
end

return M
