-- T900663 p1 — Models & Inference chapter actions (NEW file).
--
-- Makes the local model stack visible and controllable from the editor:
-- backend status, server configuration, logs, GPU/VRAM resources, and
-- explicit start/stop procedures for the llama-server systemd user units.
--
-- Live facts verified 2026-09-28 on the dev host (re-verified by the
-- executor before writing this module — zero drift):
--   :1919 serves Qwen3.8-27B-gsq-iq2s (unit qwen38-gsq-iq2s, active)
--   :1920 serves Qwen3.5-4B-MTP (unit qwen35-mtp, active)
--   :1234 is LM Studio (process llmster, active)
--   :18235 is the devmesh llm-proxy forward (answers with an auth error,
--     which proves reachability but not usable access)
--   unit glimmer is inactive even though its service file header still
--     claims the :1919 backend — the header is stale, so every function
--     below probes live state instead of trusting file headers.
--   GPUs are RTX 3060 Ti (8192 MiB) and RTX 5070 Ti (16303 MiB).
--   llama-server lives at ~/opt/llama-current/bin/llama-server.
--
-- cwd contract: every public function resolves cwd at *execution* time via
-- require('config.gitroot').root() and returns early with a WARN when no
-- git root is resolvable, mirroring config/files-search.lua. Only
-- show_config uses the resolved root (to locate the repo service files
-- under <root>/scripts/llm/); the other five probes are host-local and
-- keep the parameter for dashboard-model signature uniformity only.
--
-- No auto-start, no auto-restart, no hidden state change: start_unit and
-- stop_unit only act after an explicit unit pick plus a typed `yes`.
-- Zero BufWritePre autocmds — no format-on-save, no whitespace rewriting.

local M = {}

--- Module constants: plain data at the top so a later drift fix touches
--- one place. Ports and model ids follow the live values from the p1
--- re-verification probes, not any file header.
M.UNITS = {
  { name = 'qwen38-gsq-iq2s', port = 1919, model = 'Qwen3.8-27B-gsq-iq2s' },
  { name = 'qwen35-mtp', port = 1920, model = 'Qwen3.5-4B-MTP' },
}
M.LMSTUDIO_URL = 'http://127.0.0.1:1234'
M.PROXY_URL = 'http://127.0.0.1:18235'

local function warn(msg)
  vim.notify('models-inference: ' .. msg, vim.log.levels.WARN)
end

local function info(msg)
  vim.notify('models-inference: ' .. msg, vim.log.levels.INFO)
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

--- Run a command synchronously with a timeout, never throwing.
--- @param cmd string[]
--- @param timeout_ms integer
--- @return { code: integer, stdout: string, stderr: string }
local function run(cmd, timeout_ms)
  local ok, result = pcall(function()
    return vim.system(cmd, { text = true, timeout = timeout_ms or 8000 }):wait()
  end)
  if not ok or result == nil then
    return { code = 127, stdout = '', stderr = tostring(result) }
  end
  return { code = result.code or 1, stdout = result.stdout or '', stderr = result.stderr or '' }
end

--- Live systemd user-unit state, trimmed (e.g. 'active', 'inactive').
--- @param unit string
--- @return string
local function unit_state(unit)
  local r = run({ 'systemctl', '--user', 'is-active', unit }, 5000)
  return vim.trim(r.stdout ~= '' and r.stdout or 'unknown')
end

--- Fetch model ids from an OpenAI-style (/v1/models with `data`) or
--- llama-server-style (/v1/models with `models`) endpoint.
--- @param base_url string
--- @return string[]|nil ids, string|nil err
local function fetch_models(base_url)
  local r = run({ 'curl', '-s', '-m', '5', base_url .. '/v1/models' }, 8000)
  if r.code ~= 0 or r.stdout == '' then
    return nil, 'unreachable'
  end
  local ok, body = pcall(vim.json.decode, r.stdout)
  if not ok or type(body) ~= 'table' then
    return nil, 'unparseable reply'
  end
  if type(body.error) == 'table' then
    return nil, 'auth error (reachable, no usable access)'
  end
  local entries = body.data or body.models
  if type(entries) ~= 'table' then
    return nil, 'no model list in reply'
  end
  local ids = {}
  for _, e in ipairs(entries) do
    if type(e) == 'table' then
      ids[#ids + 1] = e.id or e.name or e.model or '?'
    elseif type(e) == 'string' then
      ids[#ids + 1] = e
    end
  end
  return ids, nil
end

--- First unit whose live state is `active`, or nil.
--- @return table|nil
local function active_unit()
  for _, u in ipairs(M.UNITS) do
    if unit_state(u.name) == 'active' then
      return u
    end
  end
  return nil
end

--- Probe every backend and show one summary (one line per backend).
--- @param cwd string|nil execution-time cwd (validated, otherwise unused)
function M.status(cwd)
  if not resolve_cwd(cwd) then return end
  local lines = {}
  for _, u in ipairs(M.UNITS) do
    local state = unit_state(u.name)
    local ids, err = fetch_models('http://127.0.0.1:' .. u.port)
    if ids then
      lines[#lines + 1] = string.format(':%d %s [%s] models: %s', u.port, u.name, state, table.concat(ids, ', '))
    else
      lines[#lines + 1] = string.format(':%d %s [%s] models: %s', u.port, u.name, state, err)
    end
  end
  local lm_ids, lm_err = fetch_models(M.LMSTUDIO_URL)
  if lm_ids then
    lines[#lines + 1] = 'LM Studio :1234 models: ' .. table.concat(lm_ids, ', ')
  else
    lines[#lines + 1] = 'LM Studio :1234 models: ' .. lm_err
  end
  local _, px_err = fetch_models(M.PROXY_URL)
  if px_err == 'auth error (reachable, no usable access)' then
    lines[#lines + 1] = 'llm-proxy :18235 reachable (auth required, no usable access)'
  elseif px_err == nil then
    lines[#lines + 1] = 'llm-proxy :18235 reachable'
  else
    lines[#lines + 1] = 'llm-proxy :18235 ' .. px_err
  end
  info(table.concat(lines, '\n'))
end

--- Parse the effective llama-server flags out of a unit file's ExecStart.
--- @param text string unit file content
--- @return string[] flag lines
local function parse_service_flags(text)
  local joined = text:gsub('\\\n', ' ')
  local exec = joined:match('ExecStart=[^\n]*') or ''
  local keys = {
    { '-c', 'context size' },
    { '-ngl', 'GPU layers' },
    { '-fa', 'flash attention' },
    { '-ctk', 'KV cache type K' },
    { '-ctv', 'KV cache type V' },
    { '-np', 'parallel slots' },
    { '--spec%-type', 'draft type' },
    { '--spec%-draft%-n%-max', 'draft n-max' },
  }
  local out = {}
  local alias = exec:match('%-%-alias%s+(%S+)')
  if alias then out[#out + 1] = 'alias: ' .. alias end
  local model = exec:match('%-m%s+(%S+)')
  if model then out[#out + 1] = 'model: ' .. model end
  for _, k in ipairs(keys) do
    local v = exec:match(k[1] .. '%s+([%S]+)')
    if v then
      out[#out + 1] = string.format('%s %s (%s)', k[1]:gsub('%%', ''), v, k[2])
    end
  end
  return out
end

--- Show the active unit's effective flags read-only in a scratch buffer.
--- @param cwd string|nil execution-time cwd (locates <root>/scripts/llm/)
function M.show_config(cwd)
  cwd = resolve_cwd(cwd)
  if not cwd then return end
  local unit = active_unit()
  if not unit then
    local names = {}
    for _, u in ipairs(M.UNITS) do names[#names + 1] = u.name end
    warn('no active unit (checked: ' .. table.concat(names, ', ') .. ')')
    return
  end
  local svc_path = cwd .. '/scripts/llm/' .. unit.name .. '.service'
  local fh = io.open(svc_path, 'r')
  if not fh then
    warn('service file not found: scripts/llm/' .. unit.name .. '.service')
    return
  end
  local text = fh:read('*a')
  fh:close()
  local lines = {
    'Effective flags for ' .. unit.name .. ' (:' .. unit.port .. ', ' .. unit.model .. ')',
    'source: scripts/llm/' .. unit.name .. '.service (live unit state: active)',
    '',
  }
  for _, l in ipairs(parse_service_flags(text)) do
    lines[#lines + 1] = '  ' .. l
  end
  local lj_fh = io.open(cwd .. '/scripts/llm/loadouts.json', 'r')
  if lj_fh then
    local lj_text = lj_fh:read('*a')
    lj_fh:close()
    local ok, lj = pcall(vim.json.decode, lj_text)
    if ok and type(lj) == 'table' and type(lj.loadouts) == 'table' then
      for _, lo in ipairs(lj.loadouts) do
        if type(lo) == 'table' and lo.port == unit.port then
          lines[#lines + 1] = ''
          lines[#lines + 1] = 'loadouts.json entry (port match, informational):'
          lines[#lines + 1] = '  slug: ' .. tostring(lo.slug) .. ' — ' .. tostring(lo.label)
          break
        end
      end
    end
  end
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].bufhidden = 'wipe'
  vim.bo[buf].readonly = true
  vim.bo[buf].modifiable = false
  vim.cmd('botright split')
  vim.api.nvim_win_set_buf(0, buf)
end

--- Tail the active unit's journal inside ToggleTerm.
--- @param cwd string|nil execution-time cwd (validated, otherwise unused)
function M.logs(cwd)
  if not resolve_cwd(cwd) then return end
  local unit = active_unit()
  if not unit then
    local names = {}
    for _, u in ipairs(M.UNITS) do names[#names + 1] = u.name end
    warn('no active unit log to tail (checked: ' .. table.concat(names, ', ') .. ')')
    return
  end
  local cmd = 'journalctl --user -u ' .. unit.name .. ' -f -n 100'
  local ok_term, term_mod = pcall(require, 'toggleterm.terminal')
  if ok_term and term_mod and term_mod.Terminal then
    local term = term_mod.Terminal:new({
      cmd = cmd,
      direction = 'float',
      close_on_exit = false,
      on_open = function(t)
        vim.api.nvim_buf_set_name(t.bufnr, 'models-inference: ' .. unit.name .. ' logs')
      end,
    })
    term:toggle()
  else
    vim.cmd('botright split | terminal ' .. cmd)
  end
end

--- Show the nvidia-smi GPU/VRAM table.
--- @param cwd string|nil execution-time cwd (validated, otherwise unused)
function M.gpu(cwd)
  if not resolve_cwd(cwd) then return end
  if vim.fn.executable('nvidia-smi') ~= 1 then
    warn('nvidia-smi not on PATH — install the NVIDIA driver to see GPU resources')
    return
  end
  local r = run({
    'nvidia-smi',
    '--query-gpu=index,name,memory.used,memory.total,utilization.gpu,temperature.gpu',
    '--format=csv',
  }, 8000)
  if r.code ~= 0 or r.stdout == '' then
    warn('nvidia-smi failed: ' .. vim.trim(r.stderr ~= '' and r.stderr or 'no output'))
    return
  end
  info(vim.trim(r.stdout))
end

--- Pick a unit, require a typed `yes`, then run the systemctl verb.
--- @param verb string 'start'|'stop'
--- @param cwd string|nil execution-time cwd (validated, otherwise unused)
local function confirmed_unit_action(verb, cwd)
  if not resolve_cwd(cwd) then return end
  local names = {}
  for _, u in ipairs(M.UNITS) do names[#names + 1] = u.name end
  vim.ui.select(names, { prompt = 'models-inference: unit to ' .. verb .. ':' }, function(choice)
    if not choice then return end
    vim.ui.input({ prompt = 'Type yes to ' .. verb .. ' ' .. choice .. ': ' }, function(answer)
      if answer ~= 'yes' then
        warn(verb .. ' ' .. choice .. ' refused (typed confirmation was not exactly `yes`)')
        return
      end
      local r = run({ 'systemctl', '--user', verb, choice }, 30000)
      local state = unit_state(choice)
      if r.code == 0 then
        info(verb .. ' ' .. choice .. ': done, is-active now reports `' .. state .. '`')
      else
        warn(verb .. ' ' .. choice .. ' failed (exit ' .. r.code .. '), is-active now reports `' .. state .. '`')
      end
    end)
  end)
end

--- Start a unit after explicit pick + typed `yes`. No auto-start.
--- @param cwd string|nil execution-time cwd (validated, otherwise unused)
function M.start_unit(cwd)
  confirmed_unit_action('start', cwd)
end

--- Stop a unit after explicit pick + typed `yes`. No auto-restart.
--- @param cwd string|nil execution-time cwd (validated, otherwise unused)
function M.stop_unit(cwd)
  confirmed_unit_action('stop', cwd)
end

return M
