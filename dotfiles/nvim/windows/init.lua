-- ============================================================================
-- Windows-Wrapper — Single Source of Truth ist die WSL-Config.
-- Alle Plugins, Guidelines, Keymaps und das LLM-Dashboard liegen ausschliesslich
-- in ~/.config/nvim auf WSL (Distro k3d-dev); diese Datei ist nur der Verweis.
-- Beim Start wird die WSL-Config EINMALIG nach %LOCALAPPDATA%\nvim-data\wsl-config
-- gespiegelt (robocopy) und von dort geladen: ein einziger UNC-Zugriff statt
-- hunderter wackeliger Einzellesungen ueber \\wsl.localhost (WSL-9P-Flakiness).
-- Aenderungen bitte immer dort:  home/patrick/.config/nvim  (Linux/WSL).
-- ============================================================================
local UNC   = '\\\\wsl.localhost\\k3d-dev\\home\\patrick\\.config\\nvim'
local CACHE = vim.fn.stdpath('data') .. '/wsl-config'
vim.g.wsl_config_cache = CACHE
-- Editing always targets the source, never the disposable Windows cache.
vim.g.neovim_config_source = UNC

local ok = false
if vim.fn.filereadable(UNC .. '\\init.lua') == 1 then
  vim.fn.system({ 'robocopy', UNC, CACHE, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2' })
  if vim.v.shell_error <= 7 and vim.fn.filereadable(CACHE .. '/init.lua') == 1 then
    ok = true
  end
end

if ok then
  vim.opt.rtp:prepend(CACHE)
  -- lazy.nvim besitzt das runtimepath: setup() entfernt fremde Eintraege wieder
  -- (verifiziert mit nvim 0.12.3 unter Windows). Der Cache liegt nicht unter
  -- stdpath('config') und fliegt deshalb aus dem rtp heraus, wodurch jedes
  -- require('config.*') danach scheitert und das Dashboard nicht startet.
  -- package.path fasst lazy nicht an, deshalb steht der Lua-Pfad zusaetzlich
  -- dort. Auf WSL ist das nicht noetig: dort ist die Config selbst
  -- stdpath('config') und damit dauerhaft im rtp.
  package.path = CACHE .. '/lua/?.lua;' .. CACHE .. '/lua/?/init.lua;' .. package.path
  local l, e = pcall(vim.cmd, 'luafile ' .. vim.fn.fnameescape(CACHE .. '/init.lua'))
  -- Selbsttest: der Mirror gilt erst als geladen, wenn die Config-Module auch
  -- wirklich aufloesbar sind. package.loaded statt require, damit der Test
  -- keine Module nachlaedt und bei einem Fehler nicht selbst fehlschlaegt.
  if l and package.loaded['config.dashboard'] == nil then
    l, e = false, 'Config-Module nicht ladbar (config.dashboard fehlt)'
  end
  vim.g.wrapper_ok = l
  vim.g.wrapper_err = l and 'none' or tostring(e)
else
  vim.g.wrapper_ok = false
  vim.g.wrapper_err = 'WSL-Config nicht erreichbar'
end
