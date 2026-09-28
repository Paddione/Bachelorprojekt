-- T900661 p1 — Repository & Code Knowledge chapter actions (NEW file).
--
-- No overlap with the thirteen kept core plugins (plugins/core.lua):
-- Telescope provides the pickers (find_files with cwd + search_dirs;
-- spec key: cmd 'Telescope'), ToggleTerm provides the terminal runner
-- (require('toggleterm.terminal').Terminal; spec key: cmd 'ToggleTerm'),
-- Plenary stays a lazy dependency, Snacks provides dashboard/UI only. K3
-- graph queries go through the `codebase-memory-mcp` CLI binary over
-- piped stdin JSON (`cli index_status|search_graph|trace_path` plus
-- `cli list_projects`; raw-JSON argv is deprecated upstream) — no MCP
-- client plugin is needed. No new plugin enters the set.
--
-- cwd contract (mirrors config/files-search.lua): every function resolves
-- cwd at *execution* time via require('config.gitroot').root() and
-- returns early with a WARN when no git root is resolvable. Functions
-- accept an optional cwd argument (the dashboard action model passes the
-- execution-time cwd) and fall back to gitroot when it is nil — never at
-- render time, never touching vim.fn.getcwd().
--
-- Live facts verified 2026-09-28 against the installed 0.9.0 binary:
--   * `cli index_status` with stdin {"project": slug} answers
--     {status, nodes, edges, git.head_sha}; an unknown project answers
--     {error = "project not found or not indexed", available_projects}.
--   * `cli search_graph` with stdin {"project", "query", "limit"} answers
--     {total, results[]}; rows carry name/qualified_name/label/file_path/
--     start_line/end_line/rank. BM25 is fuzzy — nonsense terms may still
--     match — so total=0 is the only reliable empty signal.
--   * `cli trace_path` with stdin {"project", "function_name", "depth"}
--     answers {function, direction, callers[], callees[]}; rows carry only
--     name/qualified_name/hop (no file position — quickfix gets text-only
--     entries). An unknown function answers {error = "function not found"}
--     with exit code 0.
--   * `cli list_projects` with stdin {} answers {projects[]}; entries
--     carry name/root_path — used to map a worktree cwd onto the indexed
--     main-checkout project instead of hardcoding one project name.
--   * The binary's log line (`level=info msg=mem.init ...`) goes to
--     stderr; stdout carries exactly one JSON document.
--   * Telescope find_files passes search_dirs verbatim to the finder:
--     `rg --files` (Telescope's first choice) accepts mixed file+dir
--     paths, but `fdfind` errors on file paths ("not a directory").
--     project_docs() therefore scopes the picker to directories only and
--     prints direct :edit shortcuts for the root-level instruction files.
--   * `bash scripts/vda.sh oracle '<query>'` exits 0 with an honest
--     "No local LLM service ... Discover tasks manually: ... task --list"
--     message when no LLM service runs; the terminal is shown either way.
--
-- Escaping: file paths passed to :edit go through fnameescape(); the
-- oracle query goes through shellescape(); K3 calls use argv + stdin JSON
-- (no shell involved). Zero BufWritePre autocmds — no format-on-save.
-- Read-only by design: pickers, explained-check terminals, and quickfix
-- lists only. Generated maps are viewed, never executed: this module
-- builds no shell command from map content.

local M = {}

local K3_DOC = 'docs/brain/k3-code-graph.md'

local function notify(msg, level)
  vim.notify('repo-knowledge: ' .. msg, level or vim.log.levels.INFO)
end

local function warn(msg)
  notify(msg, vim.log.levels.WARN)
end

--- Execution-time root resolution with nil guard (mirrors files-search).
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
    warn('telescope not loaded (try :Telescope once, then retry)')
    return nil
  end
  local fn = builtin[name]
  if type(fn) ~= 'function' then
    warn(string.format('telescope.builtin.%s unavailable in installed version', name))
    return nil
  end
  return fn
end

--- Open a ToggleTerm running cmd in dir, guarded (toggleterm is lazy: cmd).
--- @param cmd string shell command
--- @param dir string working directory
--- @return boolean opened
local function terminal(cmd, dir)
  local ok, tt = pcall(require, 'toggleterm.terminal')
  if not ok or type(tt.Terminal) ~= 'table' then
    warn('toggleterm not loaded (try :ToggleTerm once, then retry)')
    return false
  end
  local term_ok, term = pcall(function()
    return tt.Terminal:new({ cmd = cmd, dir = dir })
  end)
  if not term_ok or term == nil then
    warn('could not create terminal: ' .. tostring(term))
    return false
  end
  term:toggle()
  return true
end

--- Run a `codebase-memory-mcp cli <tool>` call with a stdin JSON payload.
--- @param tool string e.g. 'index_status'
--- @param payload table encoded as the stdin JSON document
--- @return table|nil decoded stdout document, string|nil error
local function k3_call(tool, payload)
  local stdin = vim.json.encode(payload)
  local ok, result = pcall(function()
    return vim.system(
      { 'codebase-memory-mcp', 'cli', tool },
      { text = true, stdin = stdin, timeout = 30000 }
    ):wait()
  end)
  if not ok or result == nil then
    return nil, 'k3 call failed: ' .. tostring(result)
  end
  if result.code ~= 0 then
    return nil, 'k3 ' .. tool .. ' exited ' .. tostring(result.code)
  end
  local dok, doc = pcall(vim.json.decode, result.stdout or '')
  if not dok then
    return nil, 'k3 ' .. tool .. ' returned non-JSON output'
  end
  return doc, nil
end

--- The K3 binary must be on PATH; otherwise every K3 action degrades to
--- a notice pointing at the graph docs, never an error.
--- @return boolean
local function k3_available()
  if vim.fn.executable('codebase-memory-mcp') ~= 1 then
    warn('K3 code graph unavailable (codebase-memory-mcp not on PATH); see ' .. K3_DOC)
    return false
  end
  return true
end

--- Derive the K3 project slug for a checkout root: the indexer names
--- projects '<abs-path-without-leading-slash, slashes-to-dashes>'
--- (verified: /home/patrick/Bachelorprojekt -> home-patrick-Bachelorprojekt).
--- @param cwd string
--- @return string
local function project_slug(cwd)
  return (cwd:gsub('^/', ''):gsub('/', '-'))
end

--- Resolve the K3 project covering cwd: the derived slug first (verified
--- via index_status), else the indexed project whose root is cwd or an
--- ancestor of cwd (covers linked worktrees of the indexed checkout).
--- @param cwd string
--- @return string|nil project name
local function resolve_k3_project(cwd)
  local slug = project_slug(cwd)
  local doc = k3_call('index_status', { project = slug })
  if doc and not doc.error and doc.status then
    return slug
  end
  local projects = k3_call('list_projects', {})
  if projects and projects.projects then
    for _, p in ipairs(projects.projects) do
      if p.root_path and (cwd == p.root_path or vim.startswith(cwd, p.root_path .. '/')) then
        return p.name
      end
    end
  end
  return nil
end

--- Join a K3 result path onto the root, tolerating absolute paths.
--- @param cwd string
--- @param rel string|nil
--- @return string
local function join_root(cwd, rel)
  if rel and vim.startswith(rel, '/') then
    return rel
  end
  return cwd .. '/' .. (rel or '')
end

--- Send rows to the quickfix list (explicit helper; mirrors files-search).
--- Rows without a filename become text-only entries (trace results carry
--- no file position). Never called with an empty list — callers notify
--- on empty results instead of touching the quickfix list.
--- @param results table[] list of { filename?, lnum?, col?, text? }
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

--- Prompt for an oracle query, then show a terminal running the task
--- oracle. The oracle itself prints the manual `task --list` fallback
--- when no LLM service runs; the terminal is shown either way.
--- @param cwd string|nil
function M.task_discover(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  vim.ui.input({ prompt = 'Task oracle query: ' }, function(query)
    if query == nil or query == '' then
      return
    end
    terminal('bash scripts/vda.sh oracle ' .. vim.fn.shellescape(query), cwd)
  end)
end

--- Probe K3 availability live and report index state plus drift against
--- the checkout HEAD. Missing binary, unknown project, or a non-ready
--- index yields a notice pointing at the graph docs, never an error.
--- @param cwd string|nil
function M.k3_status(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  if not k3_available() then
    return
  end
  local name = resolve_k3_project(cwd)
  if not name then
    warn('no K3 index covers ' .. cwd .. '; see ' .. K3_DOC)
    return
  end
  local doc, err = k3_call('index_status', { project = name })
  if not doc or doc.error or doc.status ~= 'ready' then
    local state = (doc and (doc.error or doc.status)) or err or 'unknown'
    warn(string.format("K3 index '%s' not ready (%s); see %s", name, tostring(state), K3_DOC))
    return
  end
  local head = nil
  local ok, result = pcall(function()
    return vim.system({ 'git', '-C', cwd, 'rev-parse', 'HEAD' }, { text = true, timeout = 10000 }):wait()
  end)
  if ok and result and result.code == 0 then
    head = vim.trim(result.stdout or '')
  end
  local index_head = (doc.git and doc.git.head_sha) or ''
  local drift
  if head == nil or head == '' then
    drift = 'HEAD unreadable'
  elseif index_head == head then
    drift = 'matches HEAD'
  else
    drift = string.format('drift: index %s vs HEAD %s', index_head:sub(1, 8), head:sub(1, 8))
  end
  notify(string.format(
    "K3 index '%s' ready — %s nodes / %s edges, head %s (%s)",
    name,
    tostring(doc.nodes or '?'),
    tostring(doc.edges or '?'),
    index_head:sub(1, 8),
    drift
  ))
end

--- Prompt for a symbol, run a K3 graph search, send hits to quickfix.
--- Zero hits yields a notice and leaves quickfix untouched.
--- @param cwd string|nil
function M.k3_symbol(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  if not k3_available() then
    return
  end
  vim.ui.input({ prompt = 'K3 symbol search: ' }, function(symbol)
    if symbol == nil or symbol == '' then
      return
    end
    local name = resolve_k3_project(cwd)
    if not name then
      warn('no K3 index covers ' .. cwd .. '; see ' .. K3_DOC)
      return
    end
    local doc, err = k3_call('search_graph', { project = name, query = symbol, limit = 50 })
    if not doc then
      warn(tostring(err))
      return
    end
    if doc.error then
      warn('K3 search failed: ' .. tostring(doc.error))
      return
    end
    if (doc.total or 0) == 0 or not doc.results or #doc.results == 0 then
      notify(string.format("K3 search '%s': zero hits", symbol))
      return
    end
    local items = {}
    for _, r in ipairs(doc.results) do
      items[#items + 1] = {
        filename = join_root(cwd, r.file_path),
        lnum = r.start_line or 1,
        col = 1,
        text = string.format(
          '%s — %s',
          r.name or '?',
          r.qualified_name or '?'
        ),
      }
    end
    M.send_to_quickfix(items)
    notify(string.format("K3 search '%s': %d hit(s) in quickfix", symbol, #items))
  end)
end

--- Prompt for a symbol, run a K3 caller/callee trace, send rows to
--- quickfix as text entries (trace rows carry no file position). Empty
--- results yield a notice and leave quickfix untouched.
--- @param cwd string|nil
function M.k3_trace(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  if not k3_available() then
    return
  end
  vim.ui.input({ prompt = 'K3 trace symbol: ' }, function(symbol)
    if symbol == nil or symbol == '' then
      return
    end
    local name = resolve_k3_project(cwd)
    if not name then
      warn('no K3 index covers ' .. cwd .. '; see ' .. K3_DOC)
      return
    end
    local doc, err = k3_call('trace_path', { project = name, function_name = symbol, depth = 2 })
    if not doc then
      warn(tostring(err))
      return
    end
    if doc.error then
      local hint = doc.hint and (' ' .. tostring(doc.hint)) or ''
      warn('K3 trace failed: ' .. tostring(doc.error) .. hint)
      return
    end
    local items = {}
    for _, dir in ipairs({ 'caller', 'callee' }) do
      for _, r in ipairs(doc[dir .. 's'] or {}) do
        items[#items + 1] = {
          filename = '',
          lnum = 1,
          col = 1,
          text = string.format('%s hop %s: %s', dir, tostring(r.hop or '?'), r.qualified_name or r.name or '?'),
        }
      end
    end
    if #items == 0 then
      notify(string.format("K3 trace '%s': no callers or callees", symbol))
      return
    end
    M.send_to_quickfix(items)
    notify(string.format("K3 trace '%s': %d row(s) in quickfix", symbol, #items))
  end)
end

--- Telescope file picker scoped to the docs tree plus the tool-capability
--- registry (directories only — fd-based finders reject file paths in
--- search_dirs), with direct :edit shortcuts for the root-level project
--- instruction files.
--- @param cwd string|nil
function M.project_docs(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local fn = picker('find_files')
  if not fn then
    return
  end
  fn({ cwd = cwd, search_dirs = { cwd .. '/docs', cwd .. '/docs/agent-guide/registry' } })
  local shortcuts = {}
  for _, rel in ipairs({ 'AGENTS.md', 'CLAUDE.md', 'llms.txt', 'docs/agent-guide/registry/capabilities.yaml' }) do
    if vim.loop.fs_stat(cwd .. '/' .. rel) then
      shortcuts[#shortcuts + 1] = ':edit ' .. rel
    end
  end
  if #shortcuts > 0 then
    notify('project docs picker open — root files via ' .. table.concat(shortcuts, ' · '))
  end
end

--- Telescope file picker rooted at the runbook directory.
--- @param cwd string|nil
function M.runbook_open(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local dir = cwd .. '/docs/runbooks'
  if not vim.loop.fs_stat(dir) then
    warn('docs/runbooks not found under ' .. cwd)
    return
  end
  local fn = picker('find_files')
  if not fn then
    return
  end
  fn({ cwd = dir })
end

--- Explain, then run the freshness gate in a terminal. The gate is
--- read-only: it fails when generated artifacts are stale and
--- regenerates nothing (regeneration is the separate manual
--- `task freshness:regenerate`).
--- @param cwd string|nil
function M.check_freshness(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  notify('freshness:check is a read-only gate — it fails when generated artifacts are stale and regenerates nothing (regeneration is the separate manual `task freshness:regenerate`)')
  terminal('task freshness:check', cwd)
end

--- Explain, then run the manifest validation in a terminal: a kustomize
--- dry-run with no cluster writes; production stays manual.
--- @param cwd string|nil
function M.check_manifests(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  notify('workspace:validate is a kustomize dry-run — it validates manifests without cluster writes; production stays manual')
  terminal('task workspace:validate', cwd)
end

--- State the map limits, then open a read-only Telescope picker over the
--- generated maps. Maps never yield operational commands: this module
--- builds no shell command from map content.
--- @param cwd string|nil
function M.code_maps(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  notify('code maps are generated artifacts and may be stale — verify via `task freshness:graph-check`; maps never yield operational commands')
  local fn = picker('find_files')
  if not fn then
    return
  end
  fn({ cwd = cwd, search_dirs = { cwd .. '/docs/generated', cwd .. '/docs/agent-guide/maps' } })
end

return M
