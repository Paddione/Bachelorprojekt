-- T900666 p1 — ComfyUI & Images chapter actions (NEW file).
--
-- No overlap with the thirteen kept core plugins (plugins/core.lua):
-- ToggleTerm covers terminal display (status/queue/logs/start render in a
-- visible terminal, never backgrounded silently), `curl` (8.5.0, verified
-- on PATH) covers HTTP against the ComfyUI server, `vim.ui.open` covers
-- browser handoff for the Web UI. No new plugin enters the set — this
-- module only *calls* the already-installed ToggleTerm through
-- require('toggleterm.terminal'), guarded so a missing terminal plugin
-- degrades to a notification instead of an error.
--
-- cwd contract: every function resolves cwd at *execution* time via
-- require('config.gitroot').root() and returns early with a WARN when no
-- git root is resolvable (unnamed/non-file buffer or not inside a git
-- checkout). The dashboard action model (config/dashboard.lua) already
-- nil-guards before invoking effects and passes the execution-time cwd, so
-- the functions accept an optional cwd argument and fall back to gitroot
-- when it is nil — never at render time, never touching vim.fn.getcwd().
-- The guard helper M.has_active_jobs() returns true (fail-closed) when no
-- root resolves, so destructive actions refuse outside a project.
--
-- Server addressing: the base URL is resolved at execution time from the
-- COMFY_HOST_IP / COMFY_PORT environment (same names the website uses in
-- components/website/src/pages/api/admin/generate-3d.ts). Defaults: host
-- 192.168.100.10 from environments/mentolder.yaml, port 8189. Port 8188 is
-- refused with a warning — Janus WebSocket conflict per
-- environments/schema.yaml (COMFY_PORT description). The rigger checks use
-- RIGGER_HOST_IP (default: the ComfyUI host) and RIGGER_PORT (default
-- 8190) following docs/runbooks/asset-gen-gpu-host.md.
--
-- Endpoint provenance (verified 2026-09-28, T900666 scouting):
--   repo-attested: GET /system_stats (docs/runbooks/asset-gen-gpu-host.md),
--     POST /upload/image, POST /prompt, GET /history/{id}, GET /view
--     (components/website/src/lib/comfy-client.ts).
--   upstream-attested (no live GPU host reachable from the build machine;
--     verified against the pinned upstream source instead):
--     https://github.com/comfyanonymous/ComfyUI server.py @ 8d534945ebd5
--     - GET /queue (lines 1067-1073): returns JSON
--       {queue_running: [...], queue_pending: [...]}.
--     - POST /free (lines 1195-1204): takes a JSON body with
--       unload_models / free_memory flags and unloads models (200).
--     - GET /system_stats (lines 689-722) confirms the repo-attested probe.
--
-- Queue protection: the repo has no stop script and no existing
-- unload/stop guard (verified: no scripts/*comfy*stop*, no prior guard
-- helper), so the fail-closed queue check is implemented new here and
-- proven by headless probes plus the chapter BATS block.
--
-- Escaping: file paths passed to :edit go through fnameescape(); every
-- shell argument goes through shellescape() (or a argv list, no shell
-- involved for curl/screen); terminal display lines are passed as
-- individually escaped printf arguments. Zero format-on-save autocommands
-- — no write-time autocommands, no whitespace rewriting.

local M = {}

-- Documented mesh default; the environment wins at execution time.
local DEFAULT_HOST = '192.168.100.10' -- environments/mentolder.yaml COMFY_HOST_IP
local DEFAULT_PORT = '8189'
local REFUSED_PORT = '8188' -- Janus WebSocket conflict, environments/schema.yaml

local function warn(msg)
  vim.notify('comfyui-images: ' .. msg, vim.log.levels.WARN)
end

local function info(msg)
  vim.notify('comfyui-images: ' .. msg, vim.log.levels.INFO)
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

--- Execution-time ComfyUI base URL, or nil with a warning.
--- @return string|nil base `http://host:port`
--- @return string|nil host (when base resolves)
--- @return string|nil port (when base resolves)
local function base_url()
  local host = vim.env.COMFY_HOST_IP
  if host == nil or host == '' then
    host = DEFAULT_HOST
  end
  local port = vim.env.COMFY_PORT
  if port == nil or port == '' then
    port = DEFAULT_PORT
  end
  if port == REFUSED_PORT then
    warn('refusing port 8188 (Janus WebSocket conflict, see environments/schema.yaml)')
    return nil
  end
  return 'http://' .. host .. ':' .. port, host, port
end

--- Rigger base URL for the mixamo probe (docs/runbooks/asset-gen-gpu-host.md).
--- @return string base `http://host:8190`
local function rigger_url()
  local rhost = vim.env.RIGGER_HOST_IP
  if rhost == nil or rhost == '' then
    rhost = vim.env.COMFY_HOST_IP
  end
  if rhost == nil or rhost == '' then
    rhost = DEFAULT_HOST
  end
  local rport = vim.env.RIGGER_PORT
  if rport == nil or rport == '' then
    rport = '8190'
  end
  return 'http://' .. rhost .. ':' .. rport
end

--- Render lines read-only in a visible ToggleTerm. Degrades to a
--- notification when the terminal plugin is unavailable.
--- @param lines string[]
--- @param direction string 'float'|'horizontal'
--- @param title string
local function show_lines(lines, direction, title)
  local ok, term_mod = pcall(require, 'toggleterm.terminal')
  if not ok or type(term_mod) ~= 'table' or type(term_mod.Terminal) ~= 'table' then
    warn('terminal unavailable — ' .. title .. ': ' .. table.concat(lines, ' | '))
    return
  end
  local args = { 'printf', '%s\\n' }
  for _, line in ipairs(lines) do
    args[#args + 1] = vim.fn.shellescape(line)
  end
  local term = term_mod.Terminal:new({
    cmd = table.concat(args, ' '),
    direction = direction,
    close_on_exit = false,
    on_open = function(t)
      vim.api.nvim_buf_set_name(t.bufnr, 'comfyui-images: ' .. title)
    end,
  })
  term:toggle()
end

--- Open a shell command in a visible ToggleTerm (never silently).
--- @param cmd string already-escaped shell command
--- @param direction string 'float'|'horizontal'
--- @param title string
local function show_cmd(cmd, direction, title)
  local ok, term_mod = pcall(require, 'toggleterm.terminal')
  if not ok or type(term_mod) ~= 'table' or type(term_mod.Terminal) ~= 'table' then
    warn('terminal unavailable — cannot run: ' .. title)
    return
  end
  local term = term_mod.Terminal:new({
    cmd = cmd,
    direction = direction,
    close_on_exit = false,
    on_open = function(t)
      vim.api.nvim_buf_set_name(t.bufnr, 'comfyui-images: ' .. title)
    end,
  })
  term:toggle()
end

--- GET a ComfyUI path in-process. All subprocess traffic goes through
--- vim.fn.system (argv list, no shell) so headless probes can stub and
--- record it.
--- @return string|nil body (nil when curl failed or answered empty)
local function http_get(base, path)
  local out = vim.fn.system({
    'curl', '-sf', '--connect-timeout', '3', '--max-time', '10', base .. path,
  })
  if vim.v.shell_error ~= 0 or out == nil or out == '' then
    return nil
  end
  return out
end

--- Server reachability plus GET /system_stats rendered in a ToggleTerm
--- float: queue counts, VRAM and system resource usage.
--- @param cwd string|nil execution-time cwd (optional)
function M.status(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local base, host, port = base_url()
  if not base then
    return
  end
  local body = http_get(base, '/system_stats')
  if body == nil then
    warn(string.format(
      'server unreachable at %s:%s — retry by hand: curl -sf "http://%s:%s/system_stats"',
      host, port, host, port
    ))
    return
  end
  local lines = { 'ComfyUI status — ' .. base, '' }
  local ok, stats = pcall(vim.json.decode, body)
  if ok and type(stats) == 'table' and type(stats.system) == 'table' then
    local sys = stats.system
    lines[#lines + 1] = 'os: ' .. tostring(sys.os or '?')
    lines[#lines + 1] = 'python: ' .. tostring(sys.python_version or '?')
    lines[#lines + 1] = 'pytorch: ' .. tostring(sys.pytorch_version or '?')
    if type(sys.devices) == 'table' then
      for i, dev in ipairs(sys.devices) do
        if type(dev) == 'table' then
          lines[#lines + 1] = string.format(
            'device %d: %s (%s) vram_total=%s vram_free=%s torch_vram_total=%s torch_vram_free=%s',
            i, tostring(dev.name or '?'), tostring(dev.type or '?'),
            tostring(dev.vram_total or '?'), tostring(dev.vram_free or '?'),
            tostring(dev.torch_vram_total or '?'), tostring(dev.torch_vram_free or '?')
          )
        end
      end
    end
  else
    lines[#lines + 1] = 'system_stats (raw, first 200 chars):'
    lines[#lines + 1] = body:sub(1, 200)
  end
  local qbody = http_get(base, '/queue')
  if qbody ~= nil then
    local qok, qdata = pcall(vim.json.decode, qbody)
    if qok and type(qdata) == 'table' then
      local nr = type(qdata.queue_running) == 'table' and #qdata.queue_running or -1
      local np = type(qdata.queue_pending) == 'table' and #qdata.queue_pending or -1
      lines[#lines + 1] = string.format('queue: running=%s pending=%s', tostring(nr), tostring(np))
    else
      lines[#lines + 1] = 'queue: unparsable response'
    end
  else
    lines[#lines + 1] = 'queue: unreachable'
  end
  show_lines(lines, 'float', 'status')
end

--- GET /queue rendered read-only: running job plus pending entries with
--- prompt ids. An empty queue states so explicitly.
--- @param cwd string|nil execution-time cwd (optional)
function M.queue(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local base, host, port = base_url()
  if not base then
    return
  end
  local body = http_get(base, '/queue')
  if body == nil then
    warn(string.format(
      'queue unreachable at %s:%s — is ComfyUI running? (see status, then start)',
      host, port
    ))
    return
  end
  local lines = { 'ComfyUI queue — ' .. base, '' }
  local ok, data = pcall(vim.json.decode, body)
  if not ok or type(data) ~= 'table' then
    warn('queue response unparsable — showing raw body instead')
    lines[#lines + 1] = body:sub(1, 500)
    show_lines(lines, 'float', 'queue')
    return
  end
  local running = data.queue_running
  local pending = data.queue_pending
  if type(running) ~= 'table' or type(pending) ~= 'table' then
    warn('unexpected queue shape (want queue_running/queue_pending arrays)')
    lines[#lines + 1] = body:sub(1, 500)
    show_lines(lines, 'float', 'queue')
    return
  end
  if #running == 0 and #pending == 0 then
    lines[#lines + 1] = 'queue empty: nothing running, nothing pending'
  else
    local function prompt_id(entry)
      if type(entry) ~= 'table' then
        return entry
      end
      return entry[2] or entry.prompt_id
    end
    for _, entry in ipairs(running) do
      lines[#lines + 1] = 'running: prompt ' .. tostring(prompt_id(entry) or '?')
    end
    for i, entry in ipairs(pending) do
      lines[#lines + 1] = string.format('pending #%d: prompt %s', i, tostring(prompt_id(entry) or '?'))
    end
  end
  show_lines(lines, 'float', 'queue')
end

--- Tail ~/comfyui.log and ~/rigger.log in a ToggleTerm split. A missing
--- file degrades to a warning naming the path.
--- @param cwd string|nil execution-time cwd (optional)
function M.logs(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local paths = { vim.fn.expand('~/comfyui.log'), vim.fn.expand('~/rigger.log') }
  local present = {}
  for _, p in ipairs(paths) do
    if vim.loop.fs_stat(p) then
      present[#present + 1] = vim.fn.shellescape(p)
    else
      warn('log file missing: ' .. p)
    end
  end
  if #present == 0 then
    return
  end
  show_cmd('tail -n 100 -f ' .. table.concat(present, ' '), 'horizontal', 'logs')
end

--- Run scripts/start-comfyui.sh from the git root in a visible ToggleTerm
--- so the operator watches both screen sessions come up.
--- @param cwd string|nil execution-time cwd (optional)
function M.start(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local script = cwd .. '/scripts/start-comfyui.sh'
  if not vim.loop.fs_stat(script) then
    warn('start script missing: ' .. script)
    return
  end
  show_cmd(
    'cd ' .. vim.fn.shellescape(cwd) .. ' && bash ' .. vim.fn.shellescape(script),
    'float',
    'start'
  )
  info('start launched — watch the comfyui and rigger screen sessions come up')
end

--- Server access: open the ComfyUI web UI in the browser and notify the
--- scripted generate-3d pipeline entry.
--- @param cwd string|nil execution-time cwd (optional)
function M.use(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local base = base_url()
  if not base then
    return
  end
  vim.ui.open(base)
  info('web UI opened at ' .. base .. ' — scripted path: components/website admin studio (API: pages/api/admin/generate-3d.ts)')
end

--- Guided checks in order, each printing pass/fail into a read-only view.
--- @param cwd string|nil execution-time cwd (optional)
function M.troubleshoot(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  local lines = { 'ComfyUI troubleshooting', '' }
  local function check(pass, label, detail)
    lines[#lines + 1] = (pass and 'PASS  ' or 'FAIL  ') .. label .. (detail and (' — ' .. detail) or '')
  end
  local port = vim.env.COMFY_PORT
  if port == nil or port == '' then
    port = DEFAULT_PORT
  end
  check(port ~= REFUSED_PORT, 'port is not 8188', 'COMFY_PORT=' .. port)
  local screens = vim.fn.system({ 'screen', '-ls' })
  if vim.v.shell_error ~= 0 then
    check(false, 'screen sessions visible', 'screen -ls failed (screen installed?)')
  else
    check(screens:find('comfyui') ~= nil, 'screen session comfyui present', nil)
    check(screens:find('rigger') ~= nil, 'screen session rigger present', nil)
  end
  local base = base_url()
  if base == nil then
    check(false, 'GET /system_stats answers', 'base URL refused (port 8188)')
  else
    check(http_get(base, '/system_stats') ~= nil, 'GET /system_stats answers', base)
  end
  local rcode = vim.fn.system({
    'curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST',
    '--connect-timeout', '3', '--max-time', '10', rigger_url() .. '/rig?method=mixamo',
  })
  local rcode_trimmed = vim.trim(rcode or '')
  check(
    rcode_trimmed == '501',
    'POST /rig?method=mixamo answers 501 (expected — Blender/Rigify is the only rigging path)',
    'got HTTP ' .. (rcode_trimmed == '' and 'no-response' or rcode_trimmed)
  )
  local weights = vim.fn.expand('~/ComfyUI/models/hunyuan3d/model.safetensors')
  check(vim.loop.fs_stat(weights) ~= nil, 'weights present', weights)
  show_lines(lines, 'float', 'troubleshoot')
end

--- Guard helper: true when GET /queue shows any running or pending entry.
--- Fail-closed: an unreachable server, an empty reply, or an unparsable
--- response also returns true, and each case notifies which applied.
--- Verification source for the wired endpoint: pinned upstream server.py
-- @ 8d534945ebd5, GET /queue lines 1067-1073 returns
--- {queue_running, queue_pending}; no live GPU host was reachable from
--- the build machine, so the shape above is upstream-attested, not
--- live-attested.
--- @param cwd string|nil execution-time cwd (optional)
--- @return boolean true = jobs active (or unknown — refuse destructive actions)
function M.has_active_jobs(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return true
  end
  local base = base_url()
  if not base then
    return true
  end
  local body = http_get(base, '/queue')
  if body == nil then
    warn('queue unreachable — treating as active jobs (fail-closed)')
    return true
  end
  local ok, data = pcall(vim.json.decode, body)
  if not ok or type(data) ~= 'table' then
    warn('queue response unparsable — treating as active jobs (fail-closed)')
    return true
  end
  local running = data.queue_running
  local pending = data.queue_pending
  if type(running) ~= 'table' or type(pending) ~= 'table' then
    warn('unexpected queue shape — treating as active jobs (fail-closed)')
    return true
  end
  return #running > 0 or #pending > 0
end

--- Refuse with a warning while M.has_active_jobs() is true; otherwise
--- POST /free to unload models and notify the outcome.
--- Verification source for the wired endpoint: pinned upstream server.py
-- @ 8d534945ebd5, POST /free lines 1195-1204 takes
--- {unload_models, free_memory} and unloads models (200).
--- @param cwd string|nil execution-time cwd (optional)
function M.unload(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  if M.has_active_jobs(cwd) then
    warn('refusing unload: queue shows active jobs (or the queue is unreachable)')
    return
  end
  local base = base_url()
  if not base then
    return
  end
  vim.fn.system({
    'curl', '-sf', '-X', 'POST', '-H', 'Content-Type: application/json',
    '-d', '{"unload_models": true, "free_memory": true}',
    '--connect-timeout', '3', '--max-time', '10', base .. '/free',
  })
  if vim.v.shell_error ~= 0 then
    warn('POST /free failed — models may still be loaded')
    return
  end
  info('models unloaded via POST /free')
end

--- Refuse with a warning while M.has_active_jobs() is true; otherwise quit
--- the comfyui and rigger screen sessions and notify the outcome.
--- @param cwd string|nil execution-time cwd (optional)
function M.stop(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then
    return
  end
  if M.has_active_jobs(cwd) then
    warn('refusing stop: queue shows active jobs (or the queue is unreachable)')
    return
  end
  if vim.fn.executable('screen') ~= 1 then
    warn('screen not on PATH — cannot quit sessions')
    return
  end
  local failed = {}
  for _, name in ipairs({ 'comfyui', 'rigger' }) do
    vim.fn.system({ 'screen', '-S', name, '-X', 'quit' })
    if vim.v.shell_error ~= 0 then
      failed[#failed + 1] = name
    end
  end
  if #failed > 0 then
    warn('screen quit failed for: ' .. table.concat(failed, ', ') .. ' (already gone?)')
    return
  end
  info('screen sessions comfyui and rigger quit')
end

return M
