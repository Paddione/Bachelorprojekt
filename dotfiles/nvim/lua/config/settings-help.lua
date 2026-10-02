-- T900667 p1 — Settings & Help chapter actions (NEW file).
--
-- No overlap with the thirteen kept core plugins (plugins/core.lua):
-- Snacks, Telescope, Gitsigns, Trouble, which-key, lualine, TokyoNight,
-- devicons, OpenCode, kubectl.nvim, ToggleTerm, Plenary, lazy.nvim. None
-- of them opens the repo config source, reports sync state, or manages
-- backups; :Lazy, :WhichKey and :checkhealth are only *called* here,
-- never reimplemented. No new plugin enters the set.
--
-- cwd contract: open_config_source() and sync_status() resolve the root
-- at *execution* time via require('config.gitroot').root() and return
-- early with a WARN when no root is resolvable (unnamed/non-file buffer
-- or not inside a checkout). The dashboard action model already
-- nil-guards before invoking effects and passes the execution-time cwd,
-- so both functions accept an optional cwd argument and fall back to
-- gitroot when it is nil — never at render time, never touching
-- vim.fn.getcwd().
--
-- Escaping: file paths passed to :edit / :source go through
-- fnameescape(); external comparisons and copies run through vim.system
-- with an argument vector (no shell, no vim.fn.system with a string).
-- Zero write-time autocmds — no format-on-save, no whitespace
-- rewriting, no state changes except the documented backup directory.
--
-- Facts verified live on 2026-09-28: Neovim v0.12.5 at
-- /usr/local/bin/nvim; stdpath('config') is /home/patrick/.config/nvim;
-- :Lazy and :WhichKey exist only after their plugins load; the
-- Windows/WSL sync story is documentation plus check commands (the
-- native wrapper %LOCALAPPDATA%/nvim/init.lua lives outside this repo).

local M = {}

local function warn(msg)
  vim.notify('settings-help: ' .. msg, vim.log.levels.WARN)
end

local function info(msg)
  vim.notify('settings-help: ' .. msg, vim.log.levels.INFO)
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

--- Open the repo config source (<root>/dotfiles/nvim/init.lua) for reading.
--- Warns with the missing path when the file is absent under the root.
--- @param cwd string|nil execution-time cwd (optional)
--- @return string|nil the target path (nil only when no root resolves)
function M.open_config_source(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return nil
  end
  local target = cwd .. '/dotfiles/nvim/init.lua'
  if vim.loop.fs_stat(target) then
    vim.cmd.edit(vim.fn.fnameescape(target))
  else
    warn('config source missing: ' .. target)
  end
  return target
end

--- Compare the repo config source against the live config without writing.
--- `diff -rq -x lazy-lock.json` mirrors dotfiles/install.sh (the live
--- lazy-lock.json drifts on every plugin load, so it is excluded from the
--- equality check). Install and the native Windows wrapper stay manual.
--- @param cwd string|nil execution-time cwd (optional)
--- @return string one of 'in-sync', 'differs', 'live-missing', 'no-root'
function M.sync_status(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return 'no-root'
  end
  local src = cwd .. '/dotfiles/nvim'
  local dst = vim.fn.stdpath('config')
  local hint = 'install (bash dotfiles/install.sh) and the Windows-wrapper check stay manual'
  if vim.loop.fs_stat(dst) == nil then
    info(string.format('source: %s | live: %s | state: live-missing (%s)', src, dst, hint))
    return 'live-missing'
  end
  local ok, result = pcall(function()
    return vim.system({ 'diff', '-rq', '-x', 'lazy-lock.json', src, dst }, { text = true }):wait()
  end)
  local state
  if not ok or result == nil then
    warn('sync check failed for ' .. src .. ' vs ' .. dst)
    state = 'differs'
  elseif result.code == 0 then
    state = 'in-sync'
  else
    state = 'differs'
  end
  info(string.format('source: %s | live: %s | state: %s (%s)', src, dst, state, hint))
  return state
end

--- Open the lazy.nvim plugin manager UI. The :Lazy user command exists
--- only after lazy.nvim has loaded (installed source registers it via
--- nvim_create_user_command); otherwise warn instead of failing.
function M.plugins()
  if vim.fn.exists(':Lazy') == 2 then
    vim.cmd('Lazy')
  else
    warn('lazy.nvim noch nicht geladen (try opening a file first, then retry)')
  end
end

--- Open the built-in health check (:checkhealth is always available).
function M.health()
  vim.cmd('checkhealth')
end

--- Open the which-key overview. The :WhichKey user command exists only
--- after which-key.nvim has loaded; otherwise warn instead of failing.
function M.keybindings()
  if vim.fn.exists(':WhichKey') == 2 then
    vim.cmd('WhichKey')
  else
    warn('which-key noch nicht geladen (try opening a file first, then retry)')
  end
end

--- Reload the live init.lua (default) or the given file. Uses pcall so a
--- broken config surfaces as a WARN, not as an uncaught error.
--- @param path string|nil file to source (default stdpath('config') .. '/init.lua')
--- @return boolean true when the source succeeded
function M.reload(path)
  path = path or (vim.fn.stdpath('config') .. '/init.lua')
  local ok, err = pcall(vim.cmd, 'source ' .. vim.fn.fnameescape(path))
  if ok then
    info('reloaded ' .. path)
    return true
  end
  warn('reload failed: ' .. path .. ' (' .. tostring(err) .. ')')
  return false
end

--- Copy the live config to a timestamped sibling directory. Creates
--- nothing except the new nvim-backup-<timestamp> directory.
--- @return string|nil the backup path (nil on error or missing live config)
function M.backup()
  local src = vim.fn.stdpath('config')
  if vim.loop.fs_stat(src) == nil then
    warn('live config missing: ' .. src .. ' (nothing to back up)')
    return nil
  end
  local dst = src .. '-backup-' .. os.date('%Y%m%d-%H%M%S')
  local ok, result = pcall(function()
    return vim.system({ 'cp', '-r', src, dst }, { text = true }):wait()
  end)
  if ok and result ~= nil and result.code == 0 then
    info('backup written to ' .. dst)
    return dst
  end
  warn('backup failed: ' .. src .. ' -> ' .. dst)
  return nil
end

--- Offer the newest timestamped backup for manual or confirmed restore.
--- Lists nvim-backup-* beside stdpath('config'); with no hits it warns
--- and changes nothing. Otherwise it notifies the newest backup plus the
--- manual restore command and only swaps (live aside, backup into place)
--- after an explicit vim.fn.confirm().
--- @return string one of 'recovered', 'cancelled', 'no-backups', 'recover-failed'
function M.recover()
  local live = vim.fn.stdpath('config')
  local parent = vim.fn.fnamemodify(live, ':h')
  local hits = vim.fn.glob(parent .. '/nvim-backup-*', false, true)
  if #hits == 0 then
    warn('no backups beside ' .. live .. ' (nothing to recover)')
    return 'no-backups'
  end
  table.sort(hits)
  local newest = hits[#hits]
  local manual = string.format('mv %s %s-before-recover-<ts> && cp -r %s %s', live, live, newest, live)
  info('newest backup: ' .. newest .. ' | manual restore: ' .. manual)
  local choice = vim.fn.confirm('Restore ' .. newest .. ' over the live config?', '&Yes\n&No', 2)
  if choice ~= 1 then
    return 'cancelled'
  end
  local aside = live .. '-before-recover-' .. os.date('%Y%m%d-%H%M%S')
  local ok_mv, res_mv = pcall(function()
    return vim.system({ 'mv', live, aside }, { text = true }):wait()
  end)
  if not ok_mv or res_mv == nil or res_mv.code ~= 0 then
    warn('recover failed: could not move live config aside to ' .. aside)
    return 'recover-failed'
  end
  local ok_cp, res_cp = pcall(function()
    return vim.system({ 'cp', '-r', newest, live }, { text = true }):wait()
  end)
  if not ok_cp or res_cp == nil or res_cp.code ~= 0 then
    warn('recover failed: could not copy ' .. newest .. ' to ' .. live .. ' (live config is at ' .. aside .. ')')
    return 'recover-failed'
  end
  info('recovered ' .. live .. ' from ' .. newest .. ' (previous live config moved to ' .. aside .. ')')
  return 'recovered'
end

return M
