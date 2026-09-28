-- T900659 p1 — GitHub chapter actions (NEW file).
--
-- Inventory overlap (EPIC T900654 chapter 3, verified live 2026-09-28):
-- Gitsigns (lewis6991/gitsigns.nvim, plugins/core.lua line 3, pinned in
-- lazy-lock.json) already provides hunk signs and in-buffer diff display, so
-- diff_view() reuses it through a guarded require('gitsigns') and this module
-- defines no mappings at all — nothing can collide with its documented keys.
-- Telescope is not needed here (no picker in this chapter). No new plugin
-- enters the thirteen kept core plugins.
--
-- Conventions (git-workflow skill, T004612): human display prefers `gh-axi`
-- when its binary is present (pr view, pr reviews, release view); machine
-- parsing (--json/--jq pipelines), status plumbing, and every mutation use
-- `gh` directly. Merges are squash-merges; branch work follows the repo
-- branch prefixes (feature/*, fix/*, chore/*, docs/*).
--
-- cwd contract (mirrors config/files-search.lua): every function resolves cwd
-- at *execution* time via require('config.gitroot').root(), accepts an
-- optional cwd argument (used when non-empty — the dashboard action model
-- passes the execution-time cwd), and returns early with a WARN when no git
-- root resolves. Nothing touches vim.fn.getcwd() and nothing changes CWD.
--
-- Target visibility: every action first resolves the target triple
-- (repo/branch/PR) through M.target() and notifies it, so the target is
-- visible before anything runs. The two mutations additionally pass the
-- canonical guard M.confirm_or_abort(): target + effect shown, explicit
-- vim.fn.confirm approval required, a decline aborts with zero commands
-- executed.
--
-- Execution: every external command runs via vim.system() in argv form with
-- the resolved cwd — no shell is involved, so no shell quoting is needed at
-- the exec layer. The human-readable command preview shown by the guard is
-- built with vim.fn.shellescape() so it stays copy-paste safe. No paths are
-- passed to Ex commands (:edit/:lcd are never used), so fnameescape() has no
-- call site by design. Zero autocmds — no format-on-save.

local M = {}

local function warn(msg)
  vim.notify('github: ' .. msg, vim.log.levels.WARN)
end

local function info(msg)
  vim.notify('github: ' .. msg, vim.log.levels.INFO)
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

--- Run an argv command under the resolved root, synchronously.
--- @param argv string[] command + args (argv form, no shell)
--- @param cwd string working directory (a resolved git root)
--- @return table { code, stdout, stderr }
local function run(argv, cwd)
  local ok, result = pcall(function()
    return vim.system(argv, { cwd = cwd, text = true, timeout = 30000 }):wait()
  end)
  if not ok or result == nil then
    return { code = 1, stdout = '', stderr = tostring(result) }
  end
  return { code = result.code or 1, stdout = result.stdout or '', stderr = result.stderr or '' }
end

--- True when the gh-axi display binary is on PATH.
--- @return boolean
local function has_gh_axi()
  return vim.fn.executable('gh-axi') == 1
end

--- Copy-paste-safe one-line preview of an argv command for guard prompts.
--- @param argv string[]
--- @return string
local function preview(argv)
  local parts = {}
  for _, a in ipairs(argv) do
    parts[#parts + 1] = vim.fn.shellescape(a)
  end
  return table.concat(parts, ' ')
end

local function show_result(what, r)
  if r.code == 0 then
    local out = vim.trim(r.stdout)
    info(out == '' and (what .. ': (empty)') or out)
  else
    warn(what .. ' failed: ' .. vim.trim(r.stderr))
  end
end

--- Resolve and display the visible repo/branch/PR target triple.
--- Repo and PR come from `gh --json` (machine parsing, gh direct per
--- T004612); the branch comes from git. Notifies the triple so the target
--- is visible before the calling action runs anything else.
--- @param cwd string|nil execution-time cwd (optional)
--- @return table|nil { repo, branch, pr (number string or nil), cwd }
function M.target(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return nil
  end
  local repo_out = run({ 'gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner' }, cwd)
  local branch_out = run({ 'git', 'branch', '--show-current' }, cwd)
  local pr_out = run({ 'gh', 'pr', 'view', '--json', 'number', '-q', '.number' }, cwd)
  local t = {
    repo = repo_out.code == 0 and vim.trim(repo_out.stdout) or '(unknown repo)',
    branch = branch_out.code == 0 and vim.trim(branch_out.stdout) or '(unknown branch)',
    pr = pr_out.code == 0 and vim.trim(pr_out.stdout) or nil,
    cwd = cwd,
  }
  if t.repo == '' then
    t.repo = '(unknown repo)'
  end
  if t.branch == '' then
    t.branch = '(unknown branch)'
  end
  if t.pr == '' then
    t.pr = nil
  end
  info(string.format('target: %s @ %s%s', t.repo, t.branch, t.pr and (' PR #' .. t.pr) or ' (no PR)'))
  return t
end

--- The canonical guard for the two mutating actions: shows the target and
--- the effect, then requires explicit vim.fn.confirm approval. A decline
--- aborts with no command executed.
--- @param target table triple from M.target()
--- @param effect string human-readable description of what would change
--- @param argv string[]|nil the exact command that would run (previewed escaped)
--- @return boolean true only when explicitly approved
function M.confirm_or_abort(target, effect, argv)
  local triple = '(no target)'
  if target then
    triple = string.format('%s @ %s%s', target.repo or '?', target.branch or '?',
      target.pr and (' PR #' .. target.pr) or '')
  end
  local lines = { 'Target: ' .. triple, 'Effect: ' .. effect }
  if argv then
    lines[#lines + 1] = 'Command: ' .. preview(argv)
  end
  local summary = table.concat(lines, '\n')
  info(summary)
  local choice = vim.fn.confirm('Run this GitHub mutation?\n' .. summary, '&Yes\n&No', 2)
  if choice ~= 1 then
    warn('aborted by user — nothing executed')
    return false
  end
  return true
end

--- Branches: current branch, upstream tracking state with ahead/behind
--- counts, and the repo name. Read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.branch_status(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  local up = run({ 'git', 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}' }, t.cwd)
  local upstream = up.code == 0 and vim.trim(up.stdout) or 'no upstream'
  if upstream == '' then
    upstream = 'no upstream'
  end
  local counts = ''
  if up.code == 0 then
    local ab = run({ 'git', 'rev-list', '--left-right', '--count', 'HEAD...@{u}' }, t.cwd)
    if ab.code == 0 then
      local ahead, behind = ab.stdout:match('(%d+)%s+(%d+)')
      counts = string.format(' (ahead %s, behind %s)', ahead or '?', behind or '?')
    end
  end
  info(string.format('branch: %s → %s%s', t.branch, upstream, counts))
end

--- Diffs: working-tree change summary backed by Gitsigns hunk data of the
--- current buffer (guarded require, no new plugin, no mappings). Falls back
--- to `git diff --stat` when Gitsigns is unavailable (e.g. headless).
--- Read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.diff_view(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  local ok, gs = pcall(require, 'gitsigns')
  if ok and gs and type(gs.get_hunks) == 'function' then
    local hok, hunks = pcall(gs.get_hunks)
    if hok and type(hunks) == 'table' then
      local added, changed, removed = 0, 0, 0
      for _, h in ipairs(hunks) do
        local ac = (h.added and h.added.count) or 0
        local rc = (h.removed and h.removed.count) or 0
        if ac > 0 and rc > 0 then
          changed = changed + 1
        elseif ac > 0 then
          added = added + 1
        elseif rc > 0 then
          removed = removed + 1
        end
      end
      info(string.format('gitsigns hunks in current buffer: %d (%d added, %d changed, %d removed)',
        #hunks, added, changed, removed))
      return
    end
  end
  show_result('diff --stat', run({ 'git', 'diff', '--stat' }, t.cwd))
end

--- PRs: the pull request belonging to the current branch. Human display
--- prefers gh-axi. Read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.pr_view(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  if not t.pr then
    warn('no pull request for branch ' .. t.branch)
    return
  end
  local argv = has_gh_axi()
      and { 'gh-axi', 'pr', 'view', t.pr }
      or { 'gh', 'pr', 'view', t.pr }
  show_result('pr view', run(argv, t.cwd))
end

--- Reviews: review states and comments on the current branch's PR. Human
--- display prefers gh-axi. Read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.review_list(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  if not t.pr then
    warn('no pull request for branch ' .. t.branch)
    return
  end
  local argv = has_gh_axi()
      and { 'gh-axi', 'pr', 'view', t.pr, '--reviews' }
      or { 'gh', 'pr', 'view', t.pr, '--comments' }
  show_result('review list', run(argv, t.cwd))
end

--- CI-Checks: `gh pr checks` state for the current branch's PR (gh direct,
--- status plumbing per T004612). Read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.pr_checks(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  if not t.pr then
    warn('no pull request for branch ' .. t.branch)
    return
  end
  show_result('pr checks', run({ 'gh', 'pr', 'checks', t.pr }, t.cwd))
end

--- Failure-Logs: failed job log lines of the latest failed run on the
--- current branch via `gh run view --log-failed` (gh direct). Read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.failure_logs(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  local list = run({ 'gh', 'run', 'list', '--branch', t.branch, '--status', 'failure',
    '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId' }, t.cwd)
  local id = list.code == 0 and vim.trim(list.stdout) or ''
  if id == '' then
    warn('no failed runs for branch ' .. t.branch)
    return
  end
  show_result('failure logs', run({ 'gh', 'run', 'view', id, '--log-failed' }, t.cwd))
end

--- Releases: latest release notes for the repo. The tag resolves via
--- `gh --json` (machine parsing, gh direct); human display prefers gh-axi.
--- Read-only.
--- @param cwd string|nil execution-time cwd (optional)
function M.release_view(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  local tag = run({ 'gh', 'release', 'view', '--json', 'tagName', '-q', '.tagName' }, t.cwd)
  local name = tag.code == 0 and vim.trim(tag.stdout) or ''
  if name == '' then
    warn('no releases in ' .. t.repo)
    return
  end
  local argv = has_gh_axi()
      and { 'gh-axi', 'release', 'view', name }
      or { 'gh', 'release', 'view', name }
  show_result('release view', run(argv, t.cwd))
end

--- Mergen: squash-merge (`gh pr merge --squash`, gh direct) of the current
--- branch's PR. MUTATION — canonical guard required.
--- @param cwd string|nil execution-time cwd (optional)
function M.pr_merge(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  if not t.pr then
    warn('no pull request for branch ' .. t.branch)
    return
  end
  local argv = { 'gh', 'pr', 'merge', t.pr, '--squash' }
  if not M.confirm_or_abort(t, string.format('squash-merge PR #%s into its base branch', t.pr), argv) then
    return
  end
  local r = run(argv, t.cwd)
  if r.code == 0 then
    info('PR #' .. t.pr .. ' squash-merged')
  else
    warn('merge failed: ' .. vim.trim(r.stderr))
  end
end

--- Aufraeumen: delete the current branch locally (`git branch -d`, which
--- refuses unmerged branches) and on the remote (`git push origin
--- --delete`). MUTATION — canonical guard required.
--- @param cwd string|nil execution-time cwd (optional)
function M.branch_cleanup(cwd)
  local t = M.target(cwd)
  if not t then
    return
  end
  local argv_local = { 'git', 'branch', '-d', t.branch }
  local argv_remote = { 'git', 'push', 'origin', '--delete', t.branch }
  if not M.confirm_or_abort(t, string.format('delete branch %s locally and on origin', t.branch), argv_remote) then
    return
  end
  local l = run(argv_local, t.cwd)
  if l.code == 0 then
    info('deleted local branch ' .. t.branch)
  else
    info('local delete: ' .. vim.trim(l.stderr))
  end
  local r = run(argv_remote, t.cwd)
  if r.code == 0 then
    info('deleted remote branch ' .. t.branch)
  else
    warn('remote delete failed: ' .. vim.trim(r.stderr))
  end
end

return M
