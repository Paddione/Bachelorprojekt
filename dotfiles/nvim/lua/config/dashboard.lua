-- Snacks dashboard shell — home / category / sub-page / back (T900655).
-- Opening a menu never executes anything: rendering and link traversal run
-- no shell commands, no file writes, no state changes beyond the buffer.
local M = {}

-- Highlight groups for dashboard text chunks. All are standard groups so
-- any colorscheme themes them; no custom groups to define or re-apply.
local HL_KEY = 'DiagnosticOk' -- green key chip, e.g. the p in [p]
local HL_DIM = 'Comment' -- brackets, hints, footer prose
local HL_FKEY = 'DiagnosticHint' -- navigation keys in hint/footer lines
local HL_GROUP = 'Title' -- group headers

-- Human labels stay derived from the stable kebab-case action names (which
-- runbooks and tests pin): capitalize + dashes to spaces, with explicit
-- overrides where that reads wrong (acronyms, verb-first phrasing).
local LABEL_OVERRIDES = {
  ['related-open'] = 'Open related',
  ['goto-page'] = 'Go to page',
  ['goto-component'] = 'Go to component',
  ['goto-layout'] = 'Go to layout',
  ['goto-route'] = 'Go to route',
  ['goto-design'] = 'Go to design',
  ['dev'] = 'Dev server',
  ['lsp-status'] = 'LSP status',
  ['branch-status'] = 'Branch status',
  ['pr-view'] = 'PR view',
  ['pr-checks'] = 'PR checks',
  ['pr-merge'] = 'PR merge',
  ['tickets-list'] = 'Ticket list',
  ['triage-show'] = 'Triage',
  ['readiness-show'] = 'Readiness',
  ['deps-show'] = 'Dependencies',
  ['plan-open'] = 'Open plan',
  ['task-discover'] = 'Discover tasks',
  ['k3-symbol'] = 'K3 symbol lookup',
  ['runbook-open'] = 'Open runbook',
  ['session-new'] = 'New session',
  ['server-start'] = 'Start server',
  ['server-stop'] = 'Stop server',
  ['gpu-resources'] = 'GPU resources',
  ['context-select'] = 'Select context',
}

local function label_for(name)
  if LABEL_OVERRIDES[name] then return LABEL_OVERRIDES[name] end
  return (name:gsub('^%l', string.upper):gsub('-', ' '))
end

-- Left-side key chip chunks: [p] with dim brackets, green key.
local function key_chunks(key)
  return { { '[', hl = HL_DIM }, { key, hl = HL_KEY }, { '] ', hl = HL_DIM } }
end

local function link(key, desc, page, indent)
  local text = key_chunks(key)
  text[#text + 1] = { desc .. '  ' }
  text[#text + 1] = { '>', hl = HL_DIM }
  return {
    key = key,
    desc = desc .. '  >',
    text = text,
    indent = indent or 0,
    action = function(dashboard) M.show(page, dashboard) end,
  }
end

-- Non-actionable group header inside a page's rows(). Skipped by Enter
-- navigation (no action) and by runbook/order probes (no name/key+desc).
local function group(title)
  return { title = { '▸ ' .. title, hl = HL_GROUP }, padding = { 0, 1 } }
end

--- Build a visible-action-model item. The action model's fields are all
--- present on the returned table: name, inputs, target/effect, cwd (resolved
--- at execution time, never at render time), and on_error.
--- @param spec table { name, inputs, effect, on_error }
local function action(spec)
  local label = label_for(spec.name)
  local text = key_chunks(spec.key)
  text[#text + 1] = { label }
  if spec.inputs and #spec.inputs > 0 then
    text[#text + 1] = { '  (+Eingabe: ' .. table.concat(spec.inputs, ', ') .. ')', hl = HL_DIM }
  end
  return {
    key = spec.key,
    desc = label,
    text = text,
    indent = 2,
    name = spec.name,
    inputs = spec.inputs or {},
    effect = spec.effect,
    on_error = spec.on_error,
    action = function()
      local cwd = require('config.gitroot').root()
      if cwd == nil then
        vim.notify('dashboard: no project — action needs a git-rooted buffer', vim.log.levels.WARN)
        if spec.on_error then spec.on_error() end
        return
      end
      local ok, err = pcall(spec.effect, cwd, spec.inputs or {})
      if not ok then
        vim.notify('dashboard: action failed: ' .. tostring(err), vim.log.levels.ERROR)
        if spec.on_error then spec.on_error() end
      end
    end,
  }
end

-- Fixed EPIC chapter order (design.md section 6). No Factory chapter.
local CHAPTERS = {
  { key = '1', title = 'Files & Search', page = 'files-search' },
  { key = '2', title = 'JavaScript / Frontend', page = 'js-frontend' },
  { key = '3', title = 'GitHub', page = 'github' },
  { key = '4', title = 'SDLC', page = 'sdlc' },
  { key = '5', title = 'Repository & Code Knowledge', page = 'repo-knowledge' },
  { key = '6', title = 'AI & Agents', page = 'ai-agents' },
  { key = '7', title = 'Models & Inference', page = 'models-inference' },
  { key = '8', title = 'Infrastructure', page = 'infrastructure' },
  { key = '9', title = 'ComfyUI & Images', page = 'comfyui-images' },
  { key = '0', title = 'Settings & Help', page = 'settings-help' },
}

local function stub_rows(title)
  return {
    { desc = title .. ': Kapitel-Inhalt folgt mit seinem eigenen Ticket (Stub).' },
  }
end

local pages = {
  home = {
    title = 'Inhaltsverzeichnis',
    rows = function()
      local rows = {}
      for _, chapter in ipairs(CHAPTERS) do
        rows[#rows + 1] = link(chapter.key, chapter.title, chapter.page)
      end
      return rows
    end,
  },
  -- Infrastructure chapter page (T900664).
  infrastructure = {
    title = 'Infrastructure',
    rows = function()
      return {
        action({
          key = 'c',
          name = 'cluster-status',
          inputs = {},
          effect = function(cwd) require('config.infrastructure').cluster_status(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'p',
          name = 'pods',
          inputs = {},
          effect = function(cwd) require('config.infrastructure').pods(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'v',
          name = 'services',
          inputs = {},
          effect = function(cwd) require('config.infrastructure').services(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'l',
          name = 'pod-logs',
          inputs = {},
          effect = function(cwd) require('config.infrastructure').pod_logs(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'x',
          name = 'context-select',
          inputs = {},
          effect = function(cwd) require('config.infrastructure').context_select(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'k',
          name = 'setup-checklist',
          inputs = {},
          effect = function(cwd) require('config.infrastructure').setup_checklist(cwd) end,
          on_error = function() end,
        }),
        link('s', 'Status', 'infrastructure-status'),
      }
    end,
  },
  ['infrastructure-status'] = {
    title = 'Infrastructure · Status',
    parent = 'infrastructure',
    rows = function()
      return {
        action({
          key = 'g',
          name = 'Show current buffer git root',
          inputs = {},
          effect = function(cwd)
            vim.notify('git root: ' .. cwd, vim.log.levels.INFO)
          end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- Files & Search chapter page (T900657). Rows are action() records in the
  -- exact EPIC order; each effect resolves cwd at execution time through the
  -- dashboard action model and passes it to the matching files-search module
  -- function (which nil-guards and degrades gracefully when no git root).
  ['files-search'] = {
    title = 'Files & Search',
    rows = function()
      return {
        action({
          key = 'f',
          name = 'find-file',
          inputs = {},
          effect = function(cwd) require('config.files-search').find_file(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'g',
          name = 'live-grep',
          inputs = {},
          effect = function(cwd) require('config.files-search').live_grep(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'b',
          name = 'buffers',
          inputs = {},
          effect = function(cwd) require('config.files-search').buffers(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'r',
          name = 'recent-files',
          inputs = {},
          effect = function(cwd) require('config.files-search').recent(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'o',
          name = 'related-open',
          inputs = {},
          effect = function(cwd) require('config.files-search').related(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- T900658 js-frontend registration BEGIN (do not remove; other chapters own their own blocks)
  ['js-frontend'] = {
    title = 'JavaScript / Frontend',
    rows = function()
      return {
        group('Navigation'),
        action({
          key = 'p',
          name = 'goto-page',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').goto_page(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'c',
          name = 'goto-component',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').goto_component(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'l',
          name = 'goto-layout',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').goto_layout(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'r',
          name = 'goto-route',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').goto_route(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'd',
          name = 'goto-design',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').goto_design(cwd) end,
          on_error = function() end,
        }),
        group('Entwicklung'),
        action({
          key = 'v',
          name = 'dev',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').dev(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'w',
          name = 'preview',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').preview(cwd) end,
          on_error = function() end,
        }),
        group('Prüfungen'),
        action({
          key = 'n',
          name = 'lint',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').lint(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 't',
          name = 'type-check',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').type_check(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'b',
          name = 'build',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').build(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'e',
          name = 'test',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').test_cmd(cwd) end,
          on_error = function() end,
        }),
        group('Status'),
        action({
          key = 's',
          name = 'lsp-status',
          inputs = {},
          effect = function(cwd) require('config.js-frontend').lsp_status(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- T900658 js-frontend registration END
  -- Settings & Help chapter page (T900667 p2). Rows are action() records in
  -- the exact EPIC order; each effect resolves cwd at execution time through
  -- the dashboard action model and passes it to the matching settings-help
  -- module function (which nil-guards and degrades gracefully when no root).
  ['settings-help'] = {
    title = 'Settings & Help',
    rows = function()
      return {
        action({
          key = 'o',
          name = 'open-config-source',
          inputs = {},
          effect = function(cwd) require('config.settings-help').open_config_source(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 's',
          name = 'sync-status',
          inputs = {},
          effect = function(cwd) require('config.settings-help').sync_status(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'p',
          name = 'plugins',
          inputs = {},
          effect = function(cwd) require('config.settings-help').plugins() end,
          on_error = function() end,
        }),
        action({
          key = 'c',
          name = 'health',
          inputs = {},
          effect = function(cwd) require('config.settings-help').health() end,
          on_error = function() end,
        }),
        action({
          key = 'w',
          name = 'keybindings',
          inputs = {},
          effect = function(cwd) require('config.settings-help').keybindings() end,
          on_error = function() end,
        }),
        action({
          key = 'r',
          name = 'reload-config',
          inputs = {},
          effect = function(cwd) require('config.settings-help').reload() end,
          on_error = function() end,
        }),
        action({
          key = 'b',
          name = 'backup-config',
          inputs = {},
          effect = function(cwd) require('config.settings-help').backup() end,
          on_error = function() end,
        }),
        action({
          key = 'u',
          name = 'recover-config',
          inputs = {},
          effect = function(cwd) require('config.settings-help').recover() end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- T900663 models-inference page begin
  ['models-inference'] = {
    title = 'Models & Inference',
    rows = function()
      return {
        action({
          key = 's',
          name = 'models-status',
          inputs = {},
          effect = function(cwd) require('config.models-inference').status(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'c',
          name = 'server-config',
          inputs = {},
          effect = function(cwd) require('config.models-inference').show_config(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'l',
          name = 'server-logs',
          inputs = {},
          effect = function(cwd) require('config.models-inference').logs(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'g',
          name = 'gpu-resources',
          inputs = {},
          effect = function(cwd) require('config.models-inference').gpu(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'b',
          name = 'server-start',
          inputs = {},
          effect = function(cwd) require('config.models-inference').start_unit(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'x',
          name = 'server-stop',
          inputs = {},
          effect = function(cwd) require('config.models-inference').stop_unit(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- T900663 models-inference page end
  -- T900661 repo-knowledge page (anchor: repo-knowledge)
  ['repo-knowledge'] = {
    title = 'Repository & Code Knowledge',
    rows = function()
      return {
        group('Aufgaben'),
        action({
          key = 't',
          name = 'task-discover',
          inputs = { 'query' },
          effect = function(cwd) require('config.repo-knowledge').task_discover(cwd) end,
          on_error = function() end,
        }),
        group('Codegraph'),
        action({
          key = 's',
          name = 'k3-status',
          inputs = {},
          effect = function(cwd) require('config.repo-knowledge').k3_status(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'y',
          name = 'k3-symbol',
          inputs = { 'symbol' },
          effect = function(cwd) require('config.repo-knowledge').k3_symbol(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'r',
          name = 'k3-trace',
          inputs = { 'symbol' },
          effect = function(cwd) require('config.repo-knowledge').k3_trace(cwd) end,
          on_error = function() end,
        }),
        group('Doku'),
        action({
          key = 'p',
          name = 'project-docs',
          inputs = {},
          effect = function(cwd) require('config.repo-knowledge').project_docs(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'o',
          name = 'runbook-open',
          inputs = {},
          effect = function(cwd) require('config.repo-knowledge').runbook_open(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'f',
          name = 'check-freshness',
          inputs = {},
          effect = function(cwd) require('config.repo-knowledge').check_freshness(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'm',
          name = 'check-manifests',
          inputs = {},
          effect = function(cwd) require('config.repo-knowledge').check_manifests(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'c',
          name = 'code-maps',
          inputs = {},
          effect = function(cwd) require('config.repo-knowledge').code_maps(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- AI & Agents chapter page (T900662 ai-agents). Rows are action() records
  -- in the exact EPIC order; each effect resolves cwd at execution time
  -- through the dashboard action model and passes it to the matching
  -- ai-agents module function (which nil-guards and degrades gracefully
  -- when no git root).
  ['ai-agents'] = {
    title = 'AI & Agents',
    rows = function()
      return {
        action({
          key = 'a',
          name = 'ask',
          inputs = {},
          effect = function(cwd) require('config.ai-agents').ask(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 's',
          name = 'select',
          inputs = {},
          effect = function(cwd) require('config.ai-agents').select(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'c',
          name = 'send-context',
          inputs = {},
          effect = function(cwd) require('config.ai-agents').send_context(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'k',
          name = 'list-skills',
          inputs = {},
          effect = function(cwd) require('config.ai-agents').list_skills(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'n',
          name = 'session-new',
          inputs = {},
          effect = function(cwd) require('config.ai-agents').session_new(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- ── T900666 comfyui-images chapter page ──
  -- Rows are action() records in the ticket order; each effect passes the
  -- execution-time cwd to the matching comfyui-images module function.
  -- The runbook master-index row stays stub-marked on purpose: the
  -- foundation stub-count test requires all ten rows stub-marked, the
  -- merged files-search precedent shipped the same way, and F5 coverage
  -- passes via the per-page runbook file (T900666 p2 deviation, proven).
  ['comfyui-images'] = {
    title = 'ComfyUI & Images',
    rows = function()
      return {
        action({
          key = 's',
          name = 'status',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').status(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'e',
          name = 'queue',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').queue(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'l',
          name = 'logs',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').logs(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'a',
          name = 'start',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').start(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'u',
          name = 'use',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').use(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 't',
          name = 'troubleshoot',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').troubleshoot(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'n',
          name = 'unload',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').unload(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'p',
          name = 'stop',
          inputs = {},
          effect = function(cwd) require('config.comfyui-images').stop(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- SDLC chapter page (T900660)
  ['sdlc'] = {
    title = 'SDLC',
    rows = function()
      return {
        group('Tickets'),
        action({
          key = 't',
          name = 'tickets-list',
          inputs = {},
          effect = function(cwd) require('config.sdlc').list_tickets(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'g',
          name = 'triage-show',
          inputs = {},
          effect = function(cwd) require('config.sdlc').show_triage(cwd) end,
          on_error = function() end,
        }),
        group('Planung'),
        action({
          key = 'r',
          name = 'readiness-show',
          inputs = {},
          effect = function(cwd) require('config.sdlc').show_readiness(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'd',
          name = 'deps-show',
          inputs = {},
          effect = function(cwd) require('config.sdlc').show_deps(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'p',
          name = 'plan-open',
          inputs = {},
          effect = function(cwd) require('config.sdlc').open_plan(cwd) end,
          on_error = function() end,
        }),
        group('Verifizierung'),
        action({
          key = 'x',
          name = 'exec-status',
          inputs = {},
          effect = function(cwd) require('config.sdlc').exec_status(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'v',
          name = 'verify-gates',
          inputs = {},
          effect = function(cwd) require('config.sdlc').show_gates(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'c',
          name = 'close-check',
          inputs = {},
          effect = function(cwd) require('config.sdlc').close_check(cwd) end,
          on_error = function() end,
        }),
        group('Wissen'),
        action({
          key = 's',
          name = 'process-docs',
          inputs = {},
          effect = function(cwd) require('config.sdlc').open_process_docs(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
  -- GitHub chapter page (T900659). Rows are action() records in the exact
  -- EPIC order; each effect calls the matching config.github function with
  -- the execution-time cwd from the dashboard action model.
  ['github'] = {
    title = 'GitHub',
    rows = function()
      return {
        group('Zweig'),
        action({
          key = 'b',
          name = 'branch-status',
          inputs = {},
          effect = function(cwd) require('config.github').branch_status(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'd',
          name = 'diff-view',
          inputs = {},
          effect = function(cwd) require('config.github').diff_view(cwd) end,
          on_error = function() end,
        }),
        group('Pull Request'),
        action({
          key = 'p',
          name = 'pr-view',
          inputs = {},
          effect = function(cwd) require('config.github').pr_view(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'r',
          name = 'review-list',
          inputs = {},
          effect = function(cwd) require('config.github').review_list(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'c',
          name = 'pr-checks',
          inputs = {},
          effect = function(cwd) require('config.github').pr_checks(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'l',
          name = 'failure-logs',
          inputs = {},
          effect = function(cwd) require('config.github').failure_logs(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'v',
          name = 'release-view',
          inputs = {},
          effect = function(cwd) require('config.github').release_view(cwd) end,
          on_error = function() end,
        }),
        action({
          key = 'm',
          name = 'pr-merge',
          inputs = {},
          effect = function(cwd) require('config.github').pr_merge(cwd) end,
          on_error = function() end,
        }),
        group('Aufräumen'),
        action({
          key = 'x',
          name = 'branch-cleanup',
          inputs = {},
          effect = function(cwd) require('config.github').branch_cleanup(cwd) end,
          on_error = function() end,
        }),
      }
    end,
  },
}

for _, chapter in ipairs(CHAPTERS) do
  if pages[chapter.page] == nil then
    pages[chapter.page] = {
      title = chapter.title,
      rows = function() return stub_rows(chapter.title) end,
    }
  end
end

-- Exported so runbook-coverage tooling/tests can enumerate every page and
-- sub-page (not just the ten Home chapters) without duplicating the page
-- tree (F5). Read-only by convention: callers must not mutate this table.
M.pages = pages

-- The back target is always the page's own static parent (design: fixed
-- page tree), never the dynamically last-shown page. A dynamic parent lets
-- a detour (e.g. Home -> Infrastructure -> Status -> back -> Infrastructure
-- -> back) land back on Status instead of Infrastructure/Home, and Home
-- becomes unreachable via repeated <BS> (F3).
function M.sections(page)
  local spec = assert(pages[page], 'Unknown dashboard page: ' .. tostring(page))
  local rows = {
    { text = { 'NEOVIM  /  ' .. spec.title, hl = 'SnacksDashboardHeader' }, padding = 1 },
    { desc = 'j/k oder Pfeiltasten + Enter  |  direkte Auswahl per Taste', padding = 1 },
    spec.rows(),
  }
  if page ~= 'home' then
    rows[#rows + 1] = { padding = 1 }
    rows[#rows + 1] = link('0', 'Inhaltsverzeichnis', 'home')
    local back = link('<BS>', 'Zurueck', spec.parent or 'home')
    back.hidden = true
    rows[#rows + 1] = back
    rows[#rows + 1] = { desc = 'Backspace: zurueck  |  0: Inhaltsverzeichnis' }
  end
  rows[#rows + 1] = { key = 'q', desc = 'Neovim beenden', action = ':qa' }
  return rows
end

-- The dashboard window currently open, if any — tracked so search can
-- reuse/update it instead of always opening a second one.
local current

function M.show(page, dashboard)
  page = page or 'home'
  dashboard = dashboard or current
  local sections = M.sections(page)
  if dashboard and dashboard.win and vim.api.nvim_win_is_valid(dashboard.win) then
    for _, old in ipairs(dashboard.items or {}) do
      if old.key then pcall(vim.keymap.del, 'n', old.key, { buffer = dashboard.buf }) end
    end
    dashboard.opts.sections = sections
    dashboard.page = page
    dashboard:update()
    vim.api.nvim_win_set_cursor(dashboard.win, { 1, 0 })
    current = dashboard
    return dashboard
  end
  local opened = Snacks.dashboard({ win = 0, sections = sections })
  opened.page = page
  current = opened
  return opened
end

-- Every executable row (from action()) across every page, keyed by owning
-- page and row key, so search can index actions, not just page titles.
local function collect_action_items()
  local items = {}
  for page, spec in pairs(pages) do
    local ok, rows = pcall(spec.rows)
    if ok then
      for _, row in ipairs(rows) do
        if type(row) == 'table' and row.name and row.key then
          items[#items + 1] = { text = row.name, page = page, key = row.key }
        end
      end
    end
  end
  return items
end

--- Focus (never execute) a search-picked item: open its page and, for an
--- action item, move the cursor to that action's rendered row. Execution
--- stays a separate, explicit step (Enter on the focused item). Public so
--- both the real picker's confirm callback and tests can drive it directly.
--- @param item table|nil { text, page, key? }
function M.focus(item)
  if not item then return nil end
  local dashboard = M.show(item.page)
  if item.key and dashboard and dashboard.win and vim.api.nvim_win_is_valid(dashboard.win) then
    for _, row in ipairs(dashboard.items or {}) do
      if row.key == item.key and row._ then
        vim.api.nvim_win_set_cursor(dashboard.win, { row._.row, row._.col })
        break
      end
    end
  end
  return dashboard
end

--- Search over category (page) names and action names. Selecting a hit
--- only focuses it (M.focus); execution is a separate explicit step.
function M.search()
  local items = collect_action_items()
  for page, spec in pairs(pages) do
    items[#items + 1] = { text = spec.title, page = page }
  end
  Snacks.picker.pick({
    source = 'dashboard-search',
    items = items,
    format = function(item) return { { item.text } } end,
    confirm = function(picker, item)
      picker:close()
      M.focus(item)
    end,
  })
end

function M.setup()
  vim.api.nvim_create_user_command('Dashboard', function() M.show('home') end,
    { desc = 'Open the shared table of contents' })
  vim.api.nvim_create_user_command('DashboardSearch', function() M.search() end,
    { desc = 'Search dashboard categories and actions' })
  vim.keymap.set('n', '<leader>h', '<cmd>Dashboard<CR>', { desc = 'Dashboard', silent = true })
  vim.keymap.set('n', '<leader>hf', '<cmd>DashboardSearch<CR>', { desc = 'Dashboard search', silent = true })
end

return M
