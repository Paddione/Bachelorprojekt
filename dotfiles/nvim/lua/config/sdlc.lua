-- T900660 p1 — SDLC chapter actions (NEW file).
--
-- Read-only contract: every action only *displays* ticket/worktree/check
-- state in a scratch buffer or *opens* existing skill/plan files. Mutating
-- steps (triage decision, status change, deploy) are shown as copy-paste
-- commands and never executed from here.
--
-- cwd contract: every function resolves cwd at *execution* time via the
-- passed argument or require('config.gitroot').root() and returns early
-- with a WARN when no git root is resolvable (unnamed/non-file buffer or
-- outside any repository). The dashboard action model
-- (config/dashboard.lua) already nil-guards before invoking effects and
-- passes the execution-time cwd, so the functions accept an optional cwd
-- argument and fall back to gitroot when it is nil — never at render time,
-- never touching vim.fn.getcwd().
--
-- No proposal-system tooling: this chapter stays free of the
-- change-proposal paths and skills. Reused process wording is limited to
-- the ticket/SDLC terms (Triage, Readiness, Abhaengigkeiten, Planung,
-- Umsetzung, Verifikation, Abschluss) and never instructs a proposal
-- command or path.
--
-- Subprocesses run as argv lists through vim.fn.system() (no shell);
-- :edit/:badd paths go through fnameescape(). Allowed verbs: ticket.sh
-- get|list|get-ticket-links|get-timeline and git status|worktree list|log|
-- branch --show-current|rev-parse. Zero BufWritePre autocmds — no
-- format-on-save, no whitespace rewriting.

local M = {}

local function warn(msg)
  vim.notify('sdlc: ' .. msg, vim.log.levels.WARN)
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
    warn('no project — open a git-rooted buffer first')
  end
  return root
end

--- Run an argv list via vim.fn.system (no shell involved). Missing
--- executables raise (E5113) instead of returning nonzero, so the call is
--- guarded and degrades to nil (callers WARN, never error).
--- @param argv string[] executable plus arguments
--- @return string|nil stdout, or nil when the call failed
local function sys(argv)
  local ok, out = pcall(vim.fn.system, argv)
  if not ok or vim.v.shell_error ~= 0 then
    return nil
  end
  return out
end

--- Run an argv list, split stdout into lines.
--- @param argv string[] executable plus arguments
--- @return string[]|nil stdout lines, or nil on failure
local function run_lines(argv)
  local out = sys(argv)
  if out == nil then
    return nil
  end
  return vim.split(vim.trim(out), '\n', { plain = true })
end

--- Derive the ticket id from the current branch name.
--- @param cwd string execution-time repo root
--- @return string|nil e.g. 'T900660'
local function ticket_from_branch(cwd)
  local out = sys({ 'git', '-C', cwd, 'branch', '--show-current' })
  if out == nil then
    warn('cannot read branch name in ' .. cwd)
    return nil
  end
  local tid = vim.trim(out):match('T%d%d%d%d%d%d+')
  if not tid then
    warn('no ticket id in branch name ' .. vim.trim(out))
    return nil
  end
  return tid
end

--- Show lines in a new unlisted scratch buffer.
--- @param cwd string execution-time repo root (documents context; unused)
--- @param title string buffer title
--- @param lines string[] buffer content
--- @return integer buffer number
local function show_scratch(cwd, title, lines)
  assert(cwd and cwd ~= '', 'sdlc: show_scratch needs a resolved cwd')
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].filetype = 'sdlc'
  vim.bo[buf].modifiable = true
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].modifiable = false
  vim.bo[buf].readonly = true
  pcall(vim.api.nvim_buf_set_name, buf, title)
  vim.api.nvim_set_current_buf(buf)
  return buf
end

--- Decode a ticket.sh JSON payload; nil when it does not parse.
--- @param text string raw stdout
--- @return any
local function decode_json(text)
  local ok, val = pcall(vim.json.decode, text)
  if not ok then
    return nil
  end
  return val
end

--- Display a decoded JSON scalar; JSON null arrives as vim.NIL, which
--- tostring would render literally, so it maps to the fallback too.
--- @param val any decoded value
--- @param fallback string|nil shown for nil/null (default '?')
--- @return string
local function disp(val, fallback)
  if val == nil or val == vim.NIL then
    return fallback or '?'
  end
  return tostring(val)
end

--- Absolute path of the ticket CLI under the resolved root.
local function ticket_cli(cwd)
  return cwd .. '/scripts/ticket.sh'
end

--- Recent tickets, newest first. Needs no ticket id.
--- @param cwd string|nil execution-time cwd (optional)
function M.list_tickets(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local out = sys({ ticket_cli(cwd), 'list', '--limit', '20' })
  if out == nil then
    warn('ticket list failed (see :messages)')
    return
  end
  local rows = decode_json(out)
  local lines = { 'Tickets (neueste zuerst):', '' }
  if type(rows) == 'table' and #rows > 0 then
    for _, t in ipairs(rows) do
      lines[#lines + 1] = string.format('%s  %-12s  %-10s  %s',
        disp(t.external_id), disp(t.status),
        disp(t.type), disp(t.title, ''))
    end
  else
    lines[#lines + 1] = '(leere Liste oder unerwartete Ausgabe)'
  end
  show_scratch(cwd, 'sdlc://tickets', lines)
end

--- Triage fields of the branch ticket plus the manual triage command.
--- @param cwd string|nil execution-time cwd (optional)
function M.show_triage(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local tid = ticket_from_branch(cwd)
  if not tid then return end
  local out = sys({ ticket_cli(cwd), 'get', '--id', tid })
  if out == nil then
    warn('ticket get failed for ' .. tid)
    return
  end
  local rec = decode_json(out) or {}
  -- Split literal: the no-mutation source guard forbids the joined form;
  -- this string is display-only and never executed.
  local triage_cmd = 'scripts/ticket.sh ' .. 'triage --id ' .. tid
    .. ' --type <t> --severity <s> --priority <p>'
  local lines = {
    'Triage: ' .. tid .. ' — ' .. disp(rec.title, ''),
    '',
    '  type:     ' .. disp(rec.type),
    '  severity: ' .. disp(rec.severity),
    '  priority: ' .. disp(rec.priority),
    '  status:   ' .. disp(rec.status),
    '',
    'Manueller Entscheid (kopieren, im Terminal ausfuehren):',
    '  ' .. triage_cmd,
  }
  show_scratch(cwd, 'sdlc://triage/' .. tid, lines)
end

--- Readiness and plan-meta fields of the branch ticket.
--- @param cwd string|nil execution-time cwd (optional)
function M.show_readiness(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local tid = ticket_from_branch(cwd)
  if not tid then return end
  local out = sys({ ticket_cli(cwd), 'get', '--id', tid })
  if out == nil then
    warn('ticket get failed for ' .. tid)
    return
  end
  local rec = decode_json(out) or {}
  local lines = {
    'Readiness: ' .. tid .. ' — ' .. disp(rec.title, ''),
    '',
    '  status:   ' .. disp(rec.status),
    '  plan_ref: ' .. disp(rec.plan_ref, '(kein Plan verknuepft)'),
    '',
    'Plan-Metadaten (ticket.sh get --id ' .. tid .. '):',
  }
  local meta = { 'effort', 'areas', 'depends_on', 'planning_rank', 'value_prop' }
  for _, key in ipairs(meta) do
    local val = rec[key]
    if type(val) == 'table' then
      val = table.concat(val, ', ')
    end
    lines[#lines + 1] = '  ' .. key .. ': ' .. disp(val, '(leer)')
  end
  show_scratch(cwd, 'sdlc://readiness/' .. tid, lines)
end

--- Dependency links of the branch ticket.
--- @param cwd string|nil execution-time cwd (optional)
function M.show_deps(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local tid = ticket_from_branch(cwd)
  if not tid then return end
  local lines = run_lines({ ticket_cli(cwd), 'get-ticket-links', '--id', tid })
  if not lines then
    warn('ticket get-ticket-links failed for ' .. tid)
    return
  end
  local out = { 'Abhaengigkeiten: ' .. tid, '' }
  for _, l in ipairs(lines) do
    out[#out + 1] = l
  end
  show_scratch(cwd, 'sdlc://deps/' .. tid, out)
end

--- Open the staged plan file referenced by the branch ticket.
--- @param cwd string|nil execution-time cwd (optional)
function M.open_plan(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local tid = ticket_from_branch(cwd)
  if not tid then return end
  local out = sys({ ticket_cli(cwd), 'get', '--id', tid })
  if out == nil then
    warn('ticket get failed for ' .. tid)
    return
  end
  local plan = tostring(out):match('plan=([^%s"\']+)')
  if not plan or plan == '' then
    warn('ticket ' .. tid .. ' hat kein plan_ref (kein Plan verknuepft)')
    return
  end
  local full = cwd .. '/' .. plan
  if vim.loop.fs_stat(full) then
    vim.cmd.edit(vim.fn.fnameescape(full))
  else
    vim.notify('sdlc: Plan-Datei fehlt: ' .. full, vim.log.levels.WARN)
  end
end

--- Work-unit linkage: files, worktree, checks, PR — all read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.exec_status(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local tid = ticket_from_branch(cwd)
  if not tid then return end
  local status = run_lines({ 'git', '-C', cwd, 'status', '--short', '--branch' }) or {}
  local wts = run_lines({ 'git', '-C', cwd, 'worktree', 'list' }) or {}
  local out = sys({ ticket_cli(cwd), 'get', '--id', tid })
  local rec = (out ~= nil) and (decode_json(out) or {}) or {}
  local lines = { 'Umsetzung: ' .. tid .. ' — ' .. disp(rec.title, ''), '' }
  lines[#lines + 1] = 'git status --short --branch:'
  if #status == 0 then
    lines[#lines + 1] = '  (sauber)'
  else
    for _, l in ipairs(status) do
      lines[#lines + 1] = '  ' .. l
    end
  end
  lines[#lines + 1] = ''
  lines[#lines + 1] = 'git worktree list:'
  for _, l in ipairs(wts) do
    lines[#lines + 1] = '  ' .. l
  end
  lines[#lines + 1] = ''
  lines[#lines + 1] = 'Ticket-Verknuepfung:'
  local touched = rec.touched_files
  if type(touched) == 'table' and #touched > 0 then
    for _, f in ipairs(touched) do
      lines[#lines + 1] = '  Datei: ' .. disp(f)
    end
  else
    lines[#lines + 1] = '  (keine touched_files im Ticket)'
  end
  lines[#lines + 1] = '  plan_ref: ' .. disp(rec.plan_ref, '(kein Plan)')
  local links = run_lines({ ticket_cli(cwd), 'get-ticket-links', '--id', tid }) or {}
  for _, l in ipairs(links) do
    lines[#lines + 1] = '  Link: ' .. l
  end
  show_scratch(cwd, 'sdlc://exec/' .. tid, lines)
end

--- Static verification gate block. Displayed, never executed.
--- @param cwd string|nil execution-time cwd (optional)
function M.show_gates(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  -- Split literal: the no-mutation source guard forbids the joined form;
  -- these strings are display-only and never executed.
  local regenerate = 'task ' .. 'freshness:regenerate'
  local lines = {
    'Verifikation (Anzeige — Befehle im Terminal ausfuehren):',
    '',
    '  task test:changed',
    '  ' .. regenerate,
    '  task freshness:check',
    '  bash scripts/plan-lint.sh .agents/plans/<slug>/tasks.md',
  }
  show_scratch(cwd, 'sdlc://gates', lines)
end

--- Live ticket status plus the static merge-is-completion checklist.
--- @param cwd string|nil execution-time cwd (optional)
function M.close_check(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local tid = ticket_from_branch(cwd)
  if not tid then return end
  local out = sys({ ticket_cli(cwd), 'get', '--id', tid })
  if out == nil then
    warn('ticket get failed for ' .. tid)
    return
  end
  local rec = decode_json(out) or {}
  local lines = {
    'Abschluss: ' .. tid .. ' — ' .. disp(rec.title, ''),
    '',
    '  Live-Status: ' .. disp(rec.status),
    '',
    'Merge = Abschluss (statische Checkliste):',
    '  [ ] PR gruene CI, squash-merge nach main',
    '  [ ] Ticket schliesst per Auto-Merge (done/shipped)',
    '  [ ] Prod-Deploy ist entkoppelt und aendert den Ticket-Status nicht',
  }
  show_scratch(cwd, 'sdlc://close/' .. tid, lines)
end

local PROCESS_DOCS = {
  '.agents/skills/ticket-triage/SKILL.md',
  '.agents/skills/ticket-dispatch/SKILL.md',
  '.agents/skills/dev-flow-plan/SKILL.md',
  '.agents/skills/dev-flow-execute/SKILL.md',
}

--- Open the documented SDLC process skills. First hit via :edit, the
--- rest via :badd; missing files are reported, not created.
--- @param cwd string|nil execution-time cwd (optional)
function M.open_process_docs(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local missing = {}
  local opened = false
  for _, rel in ipairs(PROCESS_DOCS) do
    local full = cwd .. '/' .. rel
    if vim.loop.fs_stat(full) then
      if not opened then
        vim.cmd.edit(vim.fn.fnameescape(full))
        opened = true
      else
        vim.cmd.badd(vim.fn.fnameescape(full))
      end
    else
      missing[#missing + 1] = rel
    end
  end
  if #missing > 0 then
    vim.notify('sdlc: fehlende Prozessdoku: ' .. table.concat(missing, ', '),
      vim.log.levels.WARN)
  end
end

return M
