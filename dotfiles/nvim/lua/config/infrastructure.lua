-- T900664 p1 — Infrastructure chapter actions (NEW file).
--
-- No overlap with the thirteen kept core plugins (plugins/core.lua):
-- kubectl.nvim provides the pods view (:Kubectl; spec key: cmd 'Kubectl',
-- core.lua line 4), ToggleTerm provides terminal display (:ToggleTerm;
-- spec key: cmd 'ToggleTerm', core.lua line 16). Diagnosis needs no new
-- picker or terminal plugin — this module only *calls* the
-- already-installed views/terminals.
--
-- Deliberate keeps: Windows/WSL routing untouched (no hardcoded paths,
-- kubectl resolved via inherited PATH); no OpenSpec integration; no
-- format-on-save (zero BufWritePre autocmds); no production mutations
-- (apply, delete, scale, deploy are not offered — manual shell only).
-- All kubectl invocations run through vim.system with argv tables and the
-- inherited environment, so WSL PATH resolution keeps working.
--
-- cwd contract: every function accepts the execution-time cwd argument
-- for dashboard action-model compatibility (config/dashboard.lua
-- nil-guards and passes it). kubectl resolves through the kubeconfig,
-- not the working directory, so cwd is only forwarded as the spawn cwd
-- and every function also tolerates nil.

local M = {}

-- In-memory selection only — never written to disk. Context switches go
-- through `kubectl config use-context` (local kubeconfig) after explicit
-- confirmation; see M.context_select.
M.state = { context = 'fleet', namespace = 'workspace' }

local INSTALL_HINT = 'kubectl not found on PATH — install kubectl '
  .. '(https://kubernetes.io/docs/tasks/tools/) and retry'

local function warn(msg)
  vim.notify('infrastructure: ' .. msg, vim.log.levels.WARN)
end

local function info(msg)
  vim.notify('infrastructure: ' .. msg, vim.log.levels.INFO)
end

--- kubectl availability guard: warn with an install hint instead of failing.
--- @return boolean
local function has_kubectl()
  if vim.fn.executable('kubectl') == 1 then
    return true
  end
  warn(INSTALL_HINT)
  return false
end

--- Run kubectl with an argv table (no shell string, no quoting layer).
--- @param args string[] argv entries after the kubectl binary
--- @param cwd string|nil spawn cwd (optional)
--- @return table|nil SystemCompleted on spawn success, nil otherwise
local function kubectl(args, cwd)
  local argv = { 'kubectl' }
  for _, a in ipairs(args) do
    argv[#argv + 1] = a
  end
  local ok, result = pcall(function()
    return vim.system(argv, { text = true, cwd = cwd }):wait()
  end)
  if not ok or result == nil then
    vim.notify('infrastructure: kubectl spawn failed', vim.log.levels.ERROR)
    return nil
  end
  return result
end

--- Split command output into lines.
--- @param s string|nil
--- @return string[]
local function split_lines(s)
  local lines = {}
  for line in ((s or '') .. '\n'):gmatch('(.-)\n') do
    lines[#lines + 1] = line
  end
  return lines
end

--- Show lines in a throwaway scratch buffer (nothing persistent).
--- Window display is best-effort so headless probes can execute actions
--- without a UI; the buffer itself is always created.
--- @param title string buffer name suffix
--- @param lines string[]
local function scratch(title, lines)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].bufhidden = 'wipe'
  vim.bo[buf].swapfile = false
  pcall(vim.api.nvim_buf_set_name, buf, 'infrastructure://' .. title)
  if not pcall(vim.cmd, 'botright split') then
    pcall(vim.api.nvim_set_current_buf, buf)
    return
  end
  pcall(vim.api.nvim_win_set_buf, 0, buf)
end

--- Read-only overview: nodes plus known contexts.
--- @param cwd string|nil execution-time cwd (optional)
function M.cluster_status(cwd)
  if not has_kubectl() then
    return
  end
  local nodes = kubectl({ 'get', 'nodes' }, cwd)
  if nodes == nil or nodes.code ~= 0 then
    vim.notify(
      'infrastructure: kubectl get nodes failed: ' .. vim.trim((nodes and nodes.stderr) or ''),
      vim.log.levels.ERROR
    )
    return
  end
  local contexts = kubectl({ 'config', 'get-contexts' }, cwd)
  if contexts == nil or contexts.code ~= 0 then
    vim.notify(
      'infrastructure: kubectl config get-contexts failed: ' .. vim.trim((contexts and contexts.stderr) or ''),
      vim.log.levels.ERROR
    )
    return
  end
  local lines = { '# kubectl get nodes' }
  for _, l in ipairs(split_lines(nodes.stdout)) do
    lines[#lines + 1] = l
  end
  lines[#lines + 1] = ''
  lines[#lines + 1] = '# kubectl config get-contexts'
  for _, l in ipairs(split_lines(contexts.stdout)) do
    lines[#lines + 1] = l
  end
  scratch('cluster-status', lines)
end

--- Open the kept kubectl.nvim pods view.
--- @param cwd string|nil execution-time cwd (accepted for action-model compatibility)
function M.pods(cwd)
  _ = cwd
  local ok = pcall(require, 'kubectl')
  if not ok then
    warn('kubectl.nvim not loaded (try :Kubectl once, then retry — spec cmd "Kubectl", T900655)')
    return
  end
  local ok_cmd, err = pcall(vim.cmd, 'Kubectl')
  if not ok_cmd then
    vim.notify('infrastructure: :Kubectl failed: ' .. tostring(err), vim.log.levels.ERROR)
  end
end

--- Read-only service list in the selected namespace.
--- @param cwd string|nil execution-time cwd (optional)
function M.services(cwd)
  if not has_kubectl() then
    return
  end
  local ns = M.state.namespace
  local result = kubectl({ 'get', 'svc', '-n', ns }, cwd)
  if result == nil or result.code ~= 0 then
    vim.notify(
      'infrastructure: kubectl get svc failed: ' .. vim.trim((result and result.stderr) or ''),
      vim.log.levels.ERROR
    )
    return
  end
  scratch('services-' .. ns, split_lines(result.stdout))
end

--- DNS-subdomain-ish charset guard for values embedded in the ToggleTerm
--- shell string (defense in depth; pod names from kubectl already match).
--- @param s string
--- @return boolean
local function is_shell_token(s)
  return s:match('^[a-z0-9][a-z0-9%.%-]*$') ~= nil
end

--- Pick one pod manually, then tail its logs in a kept ToggleTerm.
--- No automatic pod choice: the operator always selects.
--- @param cwd string|nil execution-time cwd (optional)
function M.pod_logs(cwd)
  if not has_kubectl() then
    return
  end
  local ns = M.state.namespace
  local result = kubectl({ 'get', 'pods', '-n', ns, '-o', 'name' }, cwd)
  if result == nil or result.code ~= 0 then
    vim.notify(
      'infrastructure: kubectl get pods failed: ' .. vim.trim((result and result.stderr) or ''),
      vim.log.levels.ERROR
    )
    return
  end
  local pods = {}
  for _, line in ipairs(split_lines(result.stdout)) do
    local name = vim.trim(line:gsub('^pod/', ''))
    if name ~= '' then
      pods[#pods + 1] = name
    end
  end
  if #pods == 0 then
    info('no pods in namespace ' .. ns)
    return
  end
  vim.ui.select(pods, { prompt = 'Pod logs (pick one pod):' }, function(pick)
    if pick == nil then
      info('pod-logs cancelled (no pod picked)')
      return
    end
    if not is_shell_token(pick) or not is_shell_token(ns) then
      warn('refusing unsafe pod/namespace value for the log terminal')
      return
    end
    local logcmd = 'kubectl logs -n '
      .. vim.fn.shellescape(ns)
      .. ' '
      .. vim.fn.shellescape(pick)
      .. ' -f --tail=200'
    local ok_api, term_mod = pcall(require, 'toggleterm.terminal')
    if ok_api and term_mod and term_mod.Terminal then
      local term = term_mod.Terminal:new({ cmd = logcmd, direction = 'float', close_on_exit = false })
      term:toggle()
      return
    end
    -- Fallback through the kept :ToggleTerm command when the Lua API
    -- is unavailable (lazy plugin not loaded yet).
    local ok_cmd = pcall(vim.cmd, 'ToggleTerm cmd=' .. vim.fn.shellescape(logcmd))
    if not ok_cmd then
      warn('toggleterm not loaded (try :ToggleTerm once, then retry — spec cmd "ToggleTerm", T900655)')
    end
  end)
end

--- Frozen-brand guard: any namespace mentioning korczewski is refused.
--- The korczewski brand is frozen (flux/clusters/fleet/ks-korczewski.yaml,
--- suspend: true, T002479); its namespaces stay scaled to 0.
--- @param ns string
--- @return boolean
local function is_frozen_namespace(ns)
  return ns:lower():find('korczewski', 1, true) ~= nil
end

--- Choose context (fleet/devmesh only) plus namespace, then switch the
--- local kubeconfig context after explicit confirmation. Shows the
--- current selection first; korczewski namespaces are refused outright.
--- @param cwd string|nil execution-time cwd (optional)
function M.context_select(cwd)
  if not has_kubectl() then
    return
  end
  info(string.format('current: context=%s namespace=%s', M.state.context, M.state.namespace))
  vim.ui.select({ 'fleet', 'devmesh' }, { prompt = 'Kubernetes context:' }, function(choice)
    if choice == nil then
      info('context switch cancelled (no context picked)')
      return
    end
    vim.ui.input({ prompt = 'Namespace:', default = M.state.namespace }, function(ns)
      if ns == nil or vim.trim(ns) == '' then
        info('context switch cancelled (no namespace given)')
        return
      end
      ns = vim.trim(ns)
      if is_frozen_namespace(ns) then
        warn(
          string.format(
            'refusing korczewski namespace %s: brand frozen '
              .. '(flux/clusters/fleet/ks-korczewski.yaml suspend: true, T002479) — no switch performed',
            ns
          )
        )
        return
      end
      vim.ui.select({ 'Yes, switch', 'No, cancel' }, {
        prompt = string.format('Switch to %s/%s?', choice, ns),
      }, function(confirm)
        if confirm ~= 'Yes, switch' then
          info('context switch cancelled (not confirmed)')
          return
        end
        local result = kubectl({ 'config', 'use-context', choice }, cwd)
        if result == nil or result.code ~= 0 then
          vim.notify(
            'infrastructure: kubectl config use-context failed: ' .. vim.trim((result and result.stderr) or ''),
            vim.log.levels.ERROR
          )
          return
        end
        M.state.context = choice
        M.state.namespace = ns
        info(string.format('switched to context=%s namespace=%s (local kubeconfig)', choice, ns))
      end)
    end)
  end)
end

--- Check plugins/core.lua (first runtime-path hit) for a plugin spec.
--- @param spec string plain substring, e.g. 'Ramilito/kubectl.nvim'
--- @return boolean
local function core_lua_has(spec)
  for _, rtp in ipairs(vim.api.nvim_list_runtime_paths()) do
    local f = io.open(rtp .. '/lua/plugins/core.lua', 'r')
    if f then
      local content = f:read('*a')
      f:close()
      if content and content:find(spec, 1, true) then
        return true
      end
    end
  end
  return false
end

--- Verify the infrastructure prerequisites, one line per check.
--- @param cwd string|nil execution-time cwd (optional)
function M.setup_checklist(cwd)
  local lines = {}
  if vim.fn.executable('kubectl') == 1 then
    lines[#lines + 1] = 'kubectl on PATH: yes (' .. vim.fn.exepath('kubectl') .. ')'
  else
    lines[#lines + 1] = 'kubectl on PATH: NO — ' .. INSTALL_HINT
    scratch('setup-checklist', lines)
    return
  end
  local contexts = kubectl({ 'config', 'get-contexts', '-o', 'name' }, cwd)
  if contexts ~= nil and contexts.code == 0 then
    local have = {}
    for _, line in ipairs(split_lines(contexts.stdout)) do
      have[vim.trim(line)] = true
    end
    lines[#lines + 1] = 'context fleet: ' .. (have['fleet'] and 'reachable' or 'MISSING')
    lines[#lines + 1] = 'context devmesh: ' .. (have['devmesh'] and 'reachable' or 'MISSING')
  else
    lines[#lines + 1] = 'contexts fleet/devmesh: UNKNOWN (kubectl config get-contexts failed)'
  end
  local ns = M.state.namespace
  local ns_check = kubectl({ 'get', 'ns', ns }, cwd)
  lines[#lines + 1] = 'namespace ' .. ns .. ': '
    .. ((ns_check ~= nil and ns_check.code == 0) and 'exists' or 'MISSING')
  lines[#lines + 1] = 'kubectl.nvim in plugins/core.lua: '
    .. (core_lua_has('Ramilito/kubectl.nvim') and 'present' or 'MISSING')
  lines[#lines + 1] = 'toggleterm.nvim in plugins/core.lua: '
    .. (core_lua_has('akinsho/toggleterm.nvim') and 'present' or 'MISSING')
  scratch('setup-checklist', lines)
end

return M
