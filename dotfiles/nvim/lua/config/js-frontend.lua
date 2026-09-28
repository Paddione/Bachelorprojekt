-- T900658 p1 — JavaScript / Frontend chapter actions (NEW file).
--
-- No overlap with the kept core plugins (plugins/core.lua): Telescope
-- provides the pickers (find_files; spec key: cmd 'Telescope') and
-- ToggleTerm provides the lifecycle terminals (spec key: cmd
-- 'ToggleTerm'). No new plugin enters the set — this module only *calls*
-- the already-installed pickers/terminals.
--
-- cwd contract (mirrors config.files-search, T900657): every function
-- resolves its working directory at *execution* time (optional cwd
-- argument with a config.gitroot fallback, warning plus early return
-- when no project root resolves), never at render time, never via
-- vim.fn.getcwd().
--
-- Package boundaries (verified 2026-09-28 from the lockfiles):
--   components/website/  -> pnpm (pnpm-lock.yaml present; NEVER npm here)
--   components/brett/    -> npm  (package-lock.json present)
--   repo root            -> npm, type-check only (only `typecheck` plus
--                           `test:*` variants exist; no dev/preview/lint/
--                           build/plain-test scripts)
--
-- Verified package scripts (2026-09-28):
--   website: dev=`astro dev`, preview=`astro preview`,
--     lint=`eslint . --max-warnings 0`, astro:check=`astro check`,
--     build=`astro build`, test=`node tests/api.test.mjs`
--   brett: dev (server+client concurrently), lint=`eslint .`,
--     typecheck (client+server configs), build (`vite build` + server
--     tsc), test (tsx suite); NO preview script
--
-- LSP/Treesitter status mirrors the T900656 editor-capabilities set
-- (read-only reference — that module exposes no getters, so the
-- verified name lists live here as locals): servers ts_ls, astro,
-- svelte, html, cssls; parsers astro, svelte, javascript, typescript,
-- html, css.
--
-- Escaping: every path embedded in a shell command goes through
-- vim.fn.shellescape(); picker calls carry directories as Telescope API
-- arguments (no shell involved). Zero BufWritePre autocmds — no
-- format-on-save. No install command is ever run (dependencies are a
-- documented prerequisite, installed by the user per boundary).

local M = {}

local function warn(msg)
  vim.notify('js-frontend: ' .. msg, vim.log.levels.WARN)
end

--- Execution-time root resolution with nil guard.
--- @param cwd string|nil execution-time cwd (optional)
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

--- Navigation picker rooted at the given directories under the root.
--- @param cwd string|nil execution-time cwd (optional)
--- @param title string distinct prompt title
--- @param dirs string[] repo-relative directories (verified present)
local function navigate(cwd, title, dirs)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local fn = picker('find_files')
  if not fn then return end
  local search_dirs = {}
  for _, d in ipairs(dirs) do
    search_dirs[#search_dirs + 1] = cwd .. '/' .. d
  end
  fn({ cwd = cwd, search_dirs = search_dirs, prompt_title = title })
end

--- Route pages: components/website/src/pages (incl. index.astro,
--- [service].astro dynamic segments).
--- @param cwd string|nil
function M.goto_page(cwd)
  navigate(cwd, 'JS Frontend: Pages', { 'components/website/src/pages' })
end

--- Components: Astro plus Svelte components.
--- @param cwd string|nil
function M.goto_component(cwd)
  navigate(cwd, 'JS Frontend: Components', { 'components/website/src/components' })
end

--- Layouts: Layout.astro, AdminLayout.astro, PortalLayout.astro.
--- @param cwd string|nil
function M.goto_layout(cwd)
  navigate(cwd, 'JS Frontend: Layouts', { 'components/website/src/layouts' })
end

--- API routes: components/website/src/pages/api (maps to /api/*).
--- @param cwd string|nil
function M.goto_route(cwd)
  navigate(cwd, 'JS Frontend: API Routes', { 'components/website/src/pages/api' })
end

--- Design system: token source plus the website style copy.
--- @param cwd string|nil
function M.goto_design(cwd)
  navigate(cwd, 'JS Frontend: Design System',
    { 'design/leitstand-ds', 'components/website/src/styles' })
end

--- Map the current buffer to its package boundary.
--- website buffers -> pnpm in components/website; brett buffers -> npm
--- in components/brett; any other repo buffer -> npm at the root
--- (type-check only). No branch ever yields npm for the website dir.
--- @param bufpath string|nil buffer path (defaults to current buffer)
--- @return table|nil { manager, dir, name }
local function resolve_target(bufpath)
  bufpath = bufpath or vim.api.nvim_buf_get_name(0)
  if bufpath == '' then
    warn('no target (unnamed buffer) — open a file inside the repo first')
    return nil
  end
  local abs = vim.fn.fnamemodify(bufpath, ':p')
  if abs:find('/components/website/', 1, true) then
    return { manager = 'pnpm', dir = 'components/website', name = 'website' }
  end
  if abs:find('/components/brett/', 1, true) then
    return { manager = 'npm', dir = 'components/brett', name = 'brett' }
  end
  return { manager = 'npm', dir = '.', name = 'root' }
end

--- Run one package script for the resolved target through ToggleTerm.
--- @param root string resolved project root
--- @param target table resolve_target() result
--- @param script string verified package script name
local function run(root, target, script)
  local ok, term_mod = pcall(require, 'toggleterm.terminal')
  if not ok or type(term_mod) ~= 'table' or type(term_mod.Terminal) ~= 'table' then
    warn('toggleterm not loaded (try :ToggleTerm once, then retry — spec cmd "ToggleTerm", T900655)')
    return
  end
  local pkgdir = target.dir == '.' and root or (root .. '/' .. target.dir)
  local cmd
  if target.manager == 'pnpm' then
    cmd = 'pnpm --dir ' .. vim.fn.shellescape(pkgdir) .. ' ' .. script
  else
    cmd = 'npm --prefix ' .. vim.fn.shellescape(pkgdir) .. ' run ' .. script
  end
  -- dir stays the project root so the terminal opens in a stable place;
  -- the package boundary travels inside the command itself.
  term_mod.Terminal:new({ cmd = cmd, dir = root, direction = 'horizontal' }):toggle()
end

--- Lifecycle dispatcher: resolve root + target, pick the verified
--- script for this action, or warn where the target has no such script.
--- @param cwd string|nil execution-time cwd (optional)
--- @param action string lifecycle action name (for warnings)
--- @param scripts table website/brett/root script names (nil = absent)
local function lifecycle(cwd, action, scripts)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local target = resolve_target()
  if not target then return end
  local script = scripts[target.name]
  if script == nil then
    warn(string.format('%s: no %s script for %s buffers — nothing started', action, action, target.name))
    return
  end
  run(cwd, target, script)
end

--- @param cwd string|nil
function M.dev(cwd)
  lifecycle(cwd, 'dev', { website = 'dev', brett = 'dev' })
end

--- @param cwd string|nil
function M.preview(cwd)
  lifecycle(cwd, 'preview', { website = 'preview' })
end

--- @param cwd string|nil
function M.lint(cwd)
  lifecycle(cwd, 'lint', { website = 'lint', brett = 'lint' })
end

--- @param cwd string|nil
function M.type_check(cwd)
  lifecycle(cwd, 'type-check', { website = 'astro:check', brett = 'typecheck', root = 'typecheck' })
end

--- @param cwd string|nil
function M.build(cwd)
  lifecycle(cwd, 'build', { website = 'build', brett = 'build' })
end

--- @param cwd string|nil
function M.test_cmd(cwd)
  lifecycle(cwd, 'test', { website = 'test', brett = 'test' })
end

-- Verified T900656 set (locals; editor-capabilities exposes no getters).
local LSP_SERVERS = { 'ts_ls', 'astro', 'svelte', 'html', 'cssls' }
local PARSERS = { 'astro', 'svelte', 'javascript', 'typescript', 'html', 'css' }
-- Parser language -> the LSP server that serves it (for the per-line summary).
local LANG_SERVER = {
  astro = 'astro',
  svelte = 'svelte',
  javascript = 'ts_ls',
  typescript = 'ts_ls',
  html = 'html',
  css = 'cssls',
}

--- Report LSP client plus Treesitter parser status for the frontend
--- set: one summary line per language through vim.notify. Every probe
--- is guarded, so this stays safe headless with zero clients installed.
--- @param cwd string|nil
function M.lsp_status(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local attached = {}
  local ok_clients, clients = pcall(vim.lsp.get_clients)
  if ok_clients and type(clients) == 'table' then
    for _, c in ipairs(clients) do
      if type(c) == 'table' and type(c.name) == 'string' then
        attached[c.name] = true
      end
    end
  end
  local wanted = {}
  for _, s in ipairs(LSP_SERVERS) do wanted[s] = true end
  for _, lang in ipairs(PARSERS) do
    local server = LANG_SERVER[lang]
    local lsp_state = (wanted[server] and attached[server]) and 'attached' or 'absent'
    local ok_ts, tslang = pcall(function() return vim.treesitter.language end)
    local parser_state = 'absent'
    if ok_ts and type(tslang) == 'table' and type(tslang.add) == 'function' then
      if pcall(tslang.add, lang) then
        parser_state = 'present'
      end
    end
    vim.notify(
      string.format('js-frontend: %s — lsp %s (%s), treesitter %s', lang, server, lsp_state, parser_state),
      vim.log.levels.INFO
    )
  end
end

return M
