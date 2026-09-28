#!/usr/bin/env bats
# Pruefmodus: Output-Verifikation (Ergebnisdateien aus headless Neovim-Proben);
# kein Source-Grep. T900655.

fail() {
  echo "$1" >&2
  return 1
}

setup() {
  command -v nvim >/dev/null 2>&1 || skip "nvim fehlt"

  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  # Reads the config source from an env var with a sane default so a RED
  # run (see the plan's step 7) can point this at an empty directory.
  CONFIG_SRC="${NVIM_DASHBOARD_CONFIG_SRC:-$REPO/dotfiles/nvim}"

  export XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg-config"
  export XDG_DATA_HOME="$BATS_TEST_TMPDIR/xdg-data"
  export XDG_STATE_HOME="$BATS_TEST_TMPDIR/xdg-state"
  mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME"

  # STAGE must be exactly $XDG_CONFIG_HOME/nvim (== stdpath('config')): only
  # then does Neovim's normal startup add its lua/ directory to the runtime
  # path automatically, even when started with an explicit -u file.
  STAGE="$XDG_CONFIG_HOME/nvim"
  mkdir -p "$STAGE"
  if [ -d "$CONFIG_SRC" ]; then
    cp -r "$CONFIG_SRC"/. "$STAGE"/ 2>/dev/null || true
  fi

  PROBE_DIR="$BATS_TEST_TMPDIR/probes"
  mkdir -p "$PROBE_DIR"
}

teardown() {
  : # Nothing outside BATS_TEST_TMPDIR is touched; bats cleans that up.
}

# ── Helper: write the module-load probe ─────────────────────────────────
write_load_probe() {
  cat > "$PROBE_DIR/load.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local mods = { 'config.gitroot', 'config.dashboard', 'config.editor', 'plugins.core' }
for _, m in ipairs(mods) do
  local ok, err = pcall(require, m)
  if not ok then
    io.stderr:write('LOAD FAILED ' .. m .. ': ' .. tostring(err) .. '\n')
    os.exit(1)
  end
end
print('all modules loaded')
os.exit(0)
LUA
}

@test "neovim-dashboard: staged lua modules load headless without network" {
  write_load_probe
  run nvim -l "$PROBE_DIR/load.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all modules loaded"* ]]
}

@test "neovim-dashboard: full headless startup exits clean when the plugin host is reachable" {
  if ! timeout 5 git ls-remote https://github.com/folke/lazy.nvim.git HEAD >/dev/null 2>&1; then
    skip "plugin host (github.com) unreachable — cannot bootstrap lazy.nvim offline"
  fi
  [ -f "$STAGE/init.lua" ] || fail "staged init.lua missing"

  # Priming run: bootstraps lazy.nvim + the 13 plugins. Its own log is a
  # separate file and is never the asserted run below (F6).
  SYNC_LOG="$BATS_TEST_TMPDIR/sync.log"
  nvim --headless -u "$STAGE/init.lua" -i NONE +"Lazy! sync" +qa \
    >"$BATS_TEST_TMPDIR/sync.out" 2>"$SYNC_LOG" || true

  # The actual asserted run: its own exit status and its own log.
  LOG="$BATS_TEST_TMPDIR/startup.log"
  nvim --headless -u "$STAGE/init.lua" -i NONE +qa >/dev/null 2>"$LOG"
  STARTUP_STATUS=$?
  [ "$STARTUP_STATUS" -eq 0 ]
  run bash -c "grep -qi error '$LOG'"
  [ "$status" -ne 0 ]
}

@test "neovim-dashboard: full startup registers :Dashboard and <leader>h (F1)" {
  if ! timeout 5 git ls-remote https://github.com/folke/lazy.nvim.git HEAD >/dev/null 2>&1; then
    skip "plugin host (github.com) unreachable — cannot bootstrap lazy.nvim offline"
  fi
  [ -f "$STAGE/init.lua" ] || fail "staged init.lua missing"

  nvim --headless -u "$STAGE/init.lua" -i NONE +"Lazy! sync" +qa \
    >"$BATS_TEST_TMPDIR/sync2.out" 2>"$BATS_TEST_TMPDIR/sync2.log" || true

  DASH_OUT="$BATS_TEST_TMPDIR/dashboard-check.out"
  nvim --headless -u "$STAGE/init.lua" -i NONE \
    +"lua local f = io.open('$DASH_OUT', 'w'); f:write('exists=' .. vim.fn.exists(':Dashboard') .. '\n'); f:write('mapped=' .. tostring(vim.fn.maparg('<leader>h', 'n') ~= '') .. '\n'); f:close()" \
    +qa
  run cat "$DASH_OUT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"exists=2"* ]]
  [[ "$output" == *"mapped=true"* ]]
}

# ── Helper: write the git-root probe ─────────────────────────────────────
write_gitroot_probe() {
  cat > "$PROBE_DIR/gitroot.lua" <<'LUA'
local stage, target, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
local gitroot = require('config.gitroot')
if target ~= 'UNNAMED' then
  vim.cmd.edit(vim.fn.fnameescape(target))
end
local root = gitroot.root()
local f = io.open(outfile, 'w')
f:write(root == nil and 'NIL' or root)
f:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: gitroot resolves a nested main-checkout file to the checkout top level" {
  write_gitroot_probe
  EXPECTED="$(cd "$REPO" && git rev-parse --show-toplevel)"
  OUT="$BATS_TEST_TMPDIR/gitroot-main.out"
  nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$REPO/CLAUDE.md" "$OUT"
  [ "$(cat "$OUT")" = "$EXPECTED" ]
}

@test "neovim-dashboard: gitroot resolves a linked-worktree file to that worktree root, not the main checkout" {
  write_gitroot_probe
  # A real linked worktree, created fresh under BATS_TEST_TMPDIR (F6) so
  # this case runs the same way in CI as it does locally, instead of
  # depending on a host-specific path that CI would always skip.
  WORKTREE="$BATS_TEST_TMPDIR/linked-worktree"
  # --no-checkout + a single-path checkout avoids populating git-crypt
  # -encrypted paths (environments/.secrets/...), which fail the smudge
  # filter in a fresh worktree that hasn't been git-crypt-unlocked.
  run git -C "$REPO" worktree add --detach --no-checkout "$WORKTREE" HEAD
  [ "$status" -eq 0 ]
  run git -C "$WORKTREE" checkout HEAD -- CLAUDE.md
  [ "$status" -eq 0 ]

  OUT="$BATS_TEST_TMPDIR/gitroot-worktree.out"
  nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$WORKTREE/CLAUDE.md" "$OUT"
  [ "$(cat "$OUT")" = "$WORKTREE" ]

  git -C "$REPO" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
}

@test "neovim-dashboard: gitroot reports no-project for an unnamed buffer" {
  write_gitroot_probe
  OUT="$BATS_TEST_TMPDIR/gitroot-unnamed.out"
  nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "UNNAMED" "$OUT"
  [ "$(cat "$OUT")" = "NIL" ]
}

@test "neovim-dashboard: gitroot reports no-project for a file outside any checkout" {
  write_gitroot_probe
  OUTSIDE="$BATS_TEST_TMPDIR/outside/outside.txt"
  mkdir -p "$(dirname "$OUTSIDE")"
  touch "$OUTSIDE"
  OUT="$BATS_TEST_TMPDIR/gitroot-outside.out"
  nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$OUTSIDE" "$OUT"
  [ "$(cat "$OUT")" = "NIL" ]
}

@test "neovim-dashboard: gitroot resolves a nested file under a space-containing scratch repo" {
  write_gitroot_probe
  SCRATCH="$BATS_TEST_TMPDIR/nv space/repo"
  mkdir -p "$SCRATCH/nested"
  git init -q "$SCRATCH"
  touch "$SCRATCH/nested/file.txt"
  OUT="$BATS_TEST_TMPDIR/gitroot-space.out"
  nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$SCRATCH/nested/file.txt" "$OUT"
  [ "$(cat "$OUT")" = "$SCRATCH" ]
}

# ── Helper: write the dashboard Home-order probe ─────────────────────────
write_home_probe() {
  cat > "$PROBE_DIR/home.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('home')
local link_rows = rows[3]
local f = io.open(outfile, 'w')
for _, r in ipairs(link_rows) do
  local desc = r.desc:gsub('%s*>$', '')
  f:write(desc .. '\n')
end
f:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: Home lists exactly the ten EPIC chapters in order, no Factory entry" {
  write_home_probe
  OUT="$BATS_TEST_TMPDIR/home-order.out"
  nvim -l "$PROBE_DIR/home.lua" "$STAGE" "$OUT"
  cat > "$BATS_TEST_TMPDIR/home-expected.txt" <<'EOF'
Files & Search
JavaScript / Frontend
GitHub
SDLC
Repository & Code Knowledge
AI & Agents
Models & Inference
Infrastructure
ComfyUI & Images
Settings & Help
EOF
  run diff "$BATS_TEST_TMPDIR/home-expected.txt" "$OUT"
  [ "$status" -eq 0 ]
  run bash -c "grep -qi factory '$OUT'"
  [ "$status" -ne 0 ]
}

@test "neovim-dashboard: runbook master index matches the dashboard Home order, every chapter tracked" {
  [ -f "$STAGE/runbooks/README.md" ] || fail "staged runbooks/README.md missing"
  write_home_probe
  HOME_OUT="$BATS_TEST_TMPDIR/home-order2.out"
  nvim -l "$PROBE_DIR/home.lua" "$STAGE" "$HOME_OUT"

  # (a) Extract the ten chapter names from the index's numbered list and
  # diff against the dashboard Home order. Chapters land ticket by
  # ticket: a line is valid stub-marked or complete (with a runbook
  # link), in either state, with the link allowed on either side of
  # the status (js-frontend links after, settings-help before).
  INDEX_NAMES="$BATS_TEST_TMPDIR/index-names.txt"
  grep -E '^[0-9]+\. \*\*.+\*\* — T[0-9]+ — .*status: (stub|complete)' "$STAGE/runbooks/README.md" \
    | sed -E 's/^[0-9]+\. \*\*(.+)\*\* — T[0-9]+ — .*status: (stub|complete).*/\1/' > "$INDEX_NAMES"
  run diff "$HOME_OUT" "$INDEX_NAMES"
  [ "$status" -eq 0 ]
  run bash -c "grep -qi factory '$INDEX_NAMES'"
  [ "$status" -ne 0 ]

  # (c) Every chapter entry carries an owning ticket and a valid status;
  # the count must be exactly ten. Complete chapters link their runbook,
  # and no per-chapter runbook file may exist without such a link: the
  # link may sit on either side of the status (both orders exist on
  # main), so the check intersects the complete lines with the exact
  # link target. The check is derived, so later chapters flipping
  # their own line need no further edit here; files-search.md stays
  # grandfathered from T900657, whose index line is still stub-marked.
  CHAPTER_COUNT="$(grep -cE '^[0-9]+\. \*\*.+\*\* — T[0-9]+ — .*status: (stub|complete)' "$STAGE/runbooks/README.md")"
  [ "$CHAPTER_COUNT" -eq 10 ]
  for f in "$STAGE"/runbooks/*.md; do
    base="$(basename "$f")"
    case "$base" in
      README.md|_template.md|home.md|infrastructure-status.md|editor.md|files-search.md|models-inference.md|settings-help.md|repo-knowledge.md|ai-agents.md|comfyui-images.md|infrastructure.md|sdlc.md|github.md|js-frontend.md) ;;
      *)
        run bash -c "grep -E 'status: complete' '$STAGE/runbooks/README.md' | grep -qF '(${base})'"
        [ "$status" -eq 0 ] || fail "runbook file without a complete index link: $base"
        ;;
    esac
  done
}

@test "neovim-dashboard: home.md actions[] match the dashboard Home actions in order" {
  [ -f "$STAGE/runbooks/home.md" ] || fail "staged runbooks/home.md missing"
  write_home_probe
  HOME_OUT="$BATS_TEST_TMPDIR/home-order3.out"
  nvim -l "$PROBE_DIR/home.lua" "$STAGE" "$HOME_OUT"

  ACTIONS="$BATS_TEST_TMPDIR/home-actions.txt"
  awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' \
    "$STAGE/runbooks/home.md" > "$ACTIONS"
  run diff "$HOME_OUT" "$ACTIONS"
  [ "$status" -eq 0 ]

  run grep -q '^status: complete' "$STAGE/runbooks/home.md"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: every dashboard page (not just Home's ten) has a runbook or a stub entry (F5)" {
  cat > "$PROBE_DIR/all-pages.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
if type(dashboard.pages) ~= 'table' then
  io.stderr:write('config.dashboard does not export M.pages\n')
  os.exit(1)
end
local f = io.open(outfile, 'w')
for id, spec in pairs(dashboard.pages) do
  local ok, rows = pcall(spec.rows)
  local actions = {}
  if ok then
    for _, row in ipairs(rows) do
      if type(row) == 'table' and row.name then
        -- A real executable action (visible-action-model row).
        actions[#actions + 1] = row.name
      elseif type(row) == 'table' and row.key and type(row.action) == 'function' and row.desc then
        -- A navigation link row (e.g. Home's chapter links): the
        -- runbook actions[] convention documents these too, stripped of
        -- the trailing "  >" marker.
        actions[#actions + 1] = (row.desc:gsub('%s*>$', ''))
      end
    end
  end
  f:write(id .. '\t' .. spec.title .. '\t' .. table.concat(actions, '|') .. '\n')
end
f:close()
os.exit(0)
LUA
  ALL_OUT="$BATS_TEST_TMPDIR/all-pages.out"
  run nvim -l "$PROBE_DIR/all-pages.lua" "$STAGE" "$ALL_OUT"
  [ "$status" -eq 0 ]
  [ -s "$ALL_OUT" ] || fail "no pages dumped — config.dashboard.pages export missing or empty"

  MISSING=""
  while IFS=$'\t' read -r page_id title actions_joined; do
    [ -n "$page_id" ] || continue
    RUNBOOK="$STAGE/runbooks/${page_id}.md"
    if [ -f "$RUNBOOK" ]; then
      # A real per-page runbook: status must be complete and actions[]
      # must match this page's actions, in order.
      run grep -q '^status: complete' "$RUNBOOK"
      if [ "$status" -ne 0 ]; then
        MISSING="${MISSING}${page_id} (runbook exists but not status: complete); "
        continue
      fi
      EXPECTED_ACTIONS="$BATS_TEST_TMPDIR/${page_id}-expected-actions.txt"
      if [ -n "$actions_joined" ]; then
        printf '%s\n' "$actions_joined" | tr '|' '\n' > "$EXPECTED_ACTIONS"
      else
        : > "$EXPECTED_ACTIONS"
      fi
      GOT_ACTIONS="$BATS_TEST_TMPDIR/${page_id}-got-actions.txt"
      awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' \
        "$RUNBOOK" > "$GOT_ACTIONS"
      run diff "$EXPECTED_ACTIONS" "$GOT_ACTIONS"
      if [ "$status" -ne 0 ]; then
        MISSING="${MISSING}${page_id} (actions[] mismatch); "
      fi
    else
      # No per-page runbook: the master index must at least stub-mark
      # this page by its title.
      run bash -c "grep -F -- '**${title}**' '$STAGE/runbooks/README.md' | grep -q 'status: stub'"
      if [ "$status" -ne 0 ]; then
        MISSING="${MISSING}${page_id} (no runbook file and no stub entry in README.md); "
      fi
    fi
  done < "$ALL_OUT"

  [ -z "$MISSING" ] || fail "pages without runbook coverage: $MISSING"
}

# ── Helper: write the action-shape / focus-before-execute probe ──────────
write_action_probe() {
  cat > "$PROBE_DIR/action.lua" <<'LUA'
local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. package.path

-- Test-only marker: any vim.notify call appends to marker_file. Building
-- or focusing a page never calls gitroot/effect, so it must never write
-- here; only the explicit execute step (an action's effect) does.
vim.notify = function(msg, level)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end

-- Test-only stub: no real Snacks plugin in this headless probe.
_G.Snacks = {
  dashboard = function(opts) return { win = nil, opts = opts } end,
  picker = {
    pick = function(opts)
      local item = opts.items[1]
      if opts.confirm then opts.confirm({ close = function() end }, item) end
    end,
  },
}

local dashboard = require('config.dashboard')

-- Phase 1: open every page and drive the search-focus path. No action
-- effect may run here.
dashboard.show('infrastructure-status')
dashboard.show('infrastructure')
dashboard.show('home')
dashboard.search()

local mf1 = io.open(marker_file, 'r')
local phase1_marker_exists = mf1 ~= nil
if mf1 then mf1:close() end

local rows = dashboard.sections('infrastructure-status')
local action_row = rows[3][1]

local out = io.open(out_file, 'w')
out:write('phase1_marker_exists=' .. tostring(phase1_marker_exists) .. '\n')
if action_row then
  out:write('has_name=' .. tostring(action_row.name ~= nil) .. '\n')
  out:write('has_inputs=' .. tostring(action_row.inputs ~= nil) .. '\n')
  out:write('has_effect=' .. tostring(action_row.effect ~= nil) .. '\n')
  out:write('has_on_error=' .. tostring(action_row.on_error ~= nil) .. '\n')
else
  out:write('action_row=MISSING\n')
end

-- Phase 2: explicit execute step, from a buffer inside a real checkout.
vim.cmd.edit(vim.fn.fnameescape(repo_file))
if action_row then action_row.action() end

local mf2 = io.open(marker_file, 'r')
local phase2_marker_exists = mf2 ~= nil
if mf2 then mf2:close() end
out:write('phase2_marker_exists=' .. tostring(phase2_marker_exists) .. '\n')
out:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: action rows carry the full visible-action-model shape" {
  write_action_probe
  MARKER="$BATS_TEST_TMPDIR/action-marker.txt"
  OUT="$BATS_TEST_TMPDIR/action-out.txt"
  nvim -l "$PROBE_DIR/action.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  run cat "$OUT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"has_name=true"* ]]
  [[ "$output" == *"has_inputs=true"* ]]
  [[ "$output" == *"has_effect=true"* ]]
  [[ "$output" == *"has_on_error=true"* ]]
}

@test "neovim-dashboard: opening or focusing a page never executes; the explicit step does" {
  write_action_probe
  MARKER="$BATS_TEST_TMPDIR/action-marker2.txt"
  OUT="$BATS_TEST_TMPDIR/action-out2.txt"
  nvim -l "$PROBE_DIR/action.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  run grep '^phase1_marker_exists=' "$OUT"
  [[ "$output" == *"phase1_marker_exists=false"* ]]
  run grep '^phase2_marker_exists=' "$OUT"
  [[ "$output" == *"phase2_marker_exists=true"* ]]
  [ -s "$MARKER" ]
}

@test "neovim-dashboard: selecting a search hit focuses the right page and action, runs nothing (F4)" {
  if ! timeout 5 git ls-remote https://github.com/folke/snacks.nvim.git HEAD >/dev/null 2>&1; then
    skip "plugin host (github.com) unreachable — cannot install the real snacks.nvim offline"
  fi
  [ -f "$STAGE/init.lua" ] || fail "staged init.lua missing"

  nvim --headless -u "$STAGE/init.lua" -i NONE +"Lazy! sync" +qa \
    >"$BATS_TEST_TMPDIR/f4-sync.out" 2>"$BATS_TEST_TMPDIR/f4-sync.log" || true
  SNACKS_DIR="$XDG_DATA_HOME/nvim/lazy/snacks.nvim"
  [ -d "$SNACKS_DIR" ] || fail "snacks.nvim not installed after sync — $SNACKS_DIR missing"

  cat > "$PROBE_DIR/f4-search-focus.lua" <<'LUA'
local stage, snacks_path, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4], arg[5]
package.path = stage .. '/lua/?.lua;' .. snacks_path .. '/lua/?.lua;' .. snacks_path .. '/lua/?/init.lua;' .. package.path

-- Test-only marker: any vim.notify call means something actually ran.
vim.notify = function(msg)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end

require('snacks') -- sets the real _G.Snacks (dashboard + picker, lazily required)
local dashboard = require('config.dashboard')

vim.cmd.edit(vim.fn.fnameescape(repo_file))

-- Drive the same focus path M.search's real confirm callback uses,
-- against the real Snacks.dashboard, without needing the interactive
-- picker UI itself.
local d = dashboard.focus({
  text = 'Show current buffer git root',
  page = 'infrastructure-status',
  key = 'g',
})

local out = io.open(out_file, 'w')
out:write('page=' .. tostring(d and d.page) .. '\n')
if d and d.win then
  local cursor = vim.api.nvim_win_get_cursor(d.win)
  out:write('cursor_row=' .. cursor[1] .. '\n')
  for _, row in ipairs(d.items or {}) do
    if row.key == 'g' and row._ then
      out:write('action_row=' .. row._.row .. '\n')
    end
  end
else
  out:write('no_win\n')
end
local mf = io.open(marker_file, 'r')
out:write('marker_exists=' .. tostring(mf ~= nil) .. '\n')
if mf then mf:close() end
out:close()
LUA

  MARKER="$BATS_TEST_TMPDIR/f4-marker.txt"
  OUT="$BATS_TEST_TMPDIR/f4-out.txt"
  run nvim -l "$PROBE_DIR/f4-search-focus.lua" "$STAGE" "$SNACKS_DIR" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  [ "$status" -eq 0 ]

  run cat "$OUT"
  [[ "$output" == *"page=infrastructure-status"* ]]
  [[ "$output" == *"marker_exists=false"* ]]

  CURSOR_ROW="$(grep '^cursor_row=' "$OUT" | cut -d= -f2)"
  ACTION_ROW="$(grep '^action_row=' "$OUT" | cut -d= -f2)"
  [ -n "$CURSOR_ROW" ]
  [ -n "$ACTION_ROW" ]
  [ "$CURSOR_ROW" = "$ACTION_ROW" ]
}

# ── T900656 p2: editor capabilities — capability load (a) ───────────────────
write_editor_capability_probe() {
  cat > "$PROBE_DIR/editor-capability.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.editor-capabilities')
if not ok then
  io.stderr:write('LOAD FAILED config.editor-capabilities: ' .. tostring(m) .. '\n')
  os.exit(1)
end
print('M.setup type: ' .. type(m.setup))
if type(m.setup) ~= 'function' then
  io.stderr:write('M.setup is not a function\n')
  os.exit(1)
end
print('editor-capabilities loaded, M.setup is function')
os.exit(0)
LUA
}

@test "neovim-dashboard: T900656 editor capability module loads and exposes M.setup" {
  write_editor_capability_probe
  run nvim -l "$PROBE_DIR/editor-capability.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"editor-capabilities loaded, M.setup is function"* ]]
}

# ── T900656 p2: no format-on-save (b) — zero BufWritePre autocmds ───────────
write_editor_noformat_probe() {
  cat > "$PROBE_DIR/editor-noformat.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.editor-capabilities')
if not ok then
  io.stderr:write('LOAD FAILED config.editor-capabilities: ' .. tostring(m) .. '\n')
  os.exit(1)
end
local setup_ok, setup_err = pcall(m.setup)
print('setup_ok=' .. tostring(setup_ok))
if setup_err then
  io.stderr:write('setup error: ' .. tostring(setup_err) .. '\n')
end
local au = vim.api.nvim_get_autocmds({ event = 'BufWritePre' })
print('bufwritepre_count=' .. #au)
os.exit(0)
LUA
}

@test "neovim-dashboard: T900656 no format-on-save — zero BufWritePre autocmds after M.setup" {
  write_editor_noformat_probe
  run nvim -l "$PROBE_DIR/editor-noformat.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"setup_ok=true"* ]]
  [[ "$output" == *"bufwritepre_count=0"* ]]
}

# ── T900656 p2: parser list (c) — astro + svelte among ensure_installed ─────
write_editor_parsers_probe() {
  cat > "$PROBE_DIR/editor-parsers.lua" <<'LUA'
local stage, out_file = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local captured
-- Network-free recorder: stub nvim-treesitter.configs and observe what
-- M.setup_treesitter() passes as ensure_installed (runtime capture, not
-- source reading). Lua 5.1: package.preload entries must be functions,
-- not tables — the function returns the fake configs table.
package.preload['nvim-treesitter.configs'] = function()
  return {
    setup = function(opts)
      captured = (opts and opts.ensure_installed) or {}
    end,
  }
end
local ok, m = pcall(require, 'config.editor-capabilities')
if not ok then
  io.stderr:write('LOAD FAILED config.editor-capabilities: ' .. tostring(m) .. '\n')
  os.exit(1)
end
pcall(m.setup_treesitter)
local out = io.open(out_file, 'w')
for _, p in ipairs(captured) do
  out:write('parser=' .. p .. '\n')
end
out:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: T900656 treesitter parser list contains astro and svelte" {
  write_editor_parsers_probe
  OUT="$BATS_TEST_TMPDIR/editor-parsers-out.txt"
  run nvim -l "$PROBE_DIR/editor-parsers.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  [ -s "$OUT" ] || fail "parser probe produced no output"
  grep -qx 'parser=astro' "$OUT" || fail "parser=astro missing from ensure_installed"
  grep -qx 'parser=svelte' "$OUT" || fail "parser=svelte missing from ensure_installed"
}

# ── T900656 p2: runbook step order (d) ──────────────────────────────────────
@test "neovim-dashboard: T900656 editor runbook lists the four capability steps in order" {
  RUNBOOK="$STAGE/runbooks/editor.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/editor.md missing in staged config"

  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECT="$(printf '%s\n' status parsers-install lsp-install completion-check)"

  if [ "$STEPS" != "$EXPECT" ]; then
    fail "runbook step order mismatch"
  fi
}

# ── T900657 p2: module shape ────────────────────────────────────────────────
@test "neovim-dashboard: files-search module exposes five functions" {
  write_load_probe
  STAGED="$STAGE"
  cat > "$PROBE_DIR/files-search-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.files-search')
if not ok then
  io.stderr:write('LOAD FAILED config.files-search:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
if not m.find_file then
  io.stderr:write('missing find_file\n')
  os.exit(1)
end
if not m.live_grep then
  io.stderr:write('missing live_grep\n')
  os.exit(1)
end
if not m.buffers then
  io.stderr:write('missing buffers\n')
  os.exit(1)
end
if not m.recent then
  io.stderr:write('missing recent\n')
  os.exit(1)
end
if not m.related then
  io.stderr:write('missing related\n')
  os.exit(1)
end
print('all five functions exist')
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/files-search-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all five functions exist"* ]]
}

# ── T900657 p2: page order ─────────────────────────────────────────────────
@test "neovim-dashboard: files-search page lists five actions in order" {
  write_home_probe
  cat > "$PROBE_DIR/files-search-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('files-search')
local names = {}
for _, r in ipairs(rows[3]) do
  if r.name then
    names[#names + 1] = r.name
  end
end
local f = io.open(outfile, 'w')
for _, n in ipairs(names) do
  f:write(n .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/files-search-order.out"
  run nvim -l "$PROBE_DIR/files-search-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  run cat "$OUT"
  EXPECTED="$(printf 'find-file\nlive-grep\nbuffers\nrecent-files\nrelated-open\n')"
  run diff - <<< "$EXPECTED" "$OUT"
  [ "$status" -eq 0 ]
}

# ── T900657 p2: find-file gitroot cwd resolution (nested / worktree / space) ──
write_findfile_cwd_probe() {
  cat > "$PROBE_DIR/find-file-cwd.lua" <<'LUA'
local stage, target, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
-- Fake telescope.builtin recorder: package.preload entries must be FUNCTIONS
-- returning the module table (Lua 5.1 silently skips preload tables).
local recorded = {}
package.preload['telescope.builtin'] = function()
  return {
    find_files = function(opts) recorded.cwd = opts and opts.cwd or nil end,
    live_grep = function() end,
    buffers = function() end,
    oldfiles = function() end,
  }
end
local ok, m = pcall(require, 'config.files-search')
if not ok then
  io.stderr:write('LOAD FAILED\n')
  os.exit(1)
end
vim.cmd.edit(vim.fn.fnameescape(target))
local okc, err = pcall(m.find_file)
if not okc then
  io.stderr:write('FIND_FILE FAILED: ' .. tostring(err) .. '\n')
  os.exit(1)
end
local f = io.open(outfile, 'w')
f:write((recorded.cwd or 'NO_CWD') .. '\n')
f:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: find-file resolves nested scratch repo to toplevel" {
  write_findfile_cwd_probe
  SCRATCH="$BATS_TEST_TMPDIR/fs-nested-scratch"
  mkdir -p "$SCRATCH/nested/deep"
  git -C "$SCRATCH" init -q
  printf 'x\n' > "$SCRATCH/nested/deep/file.lua"
  EXPECTED="$(cd "$SCRATCH" && git rev-parse --show-toplevel)"
  OUT="$BATS_TEST_TMPDIR/fs-cwd-nested.out"
  run nvim -l "$PROBE_DIR/find-file-cwd.lua" "$STAGE" "$SCRATCH/nested/deep/file.lua" "$OUT"
  [ "$status" -eq 0 ]
  run diff <(printf '%s\n' "$EXPECTED") "$OUT"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: find-file resolves linked worktree to its toplevel" {
  write_findfile_cwd_probe
  WORKTREE="$BATS_TEST_TMPDIR/fs-linked-worktree"
  git -C "$REPO" worktree add --detach --no-checkout "$WORKTREE" HEAD >/dev/null 2>&1
  git -C "$WORKTREE" checkout HEAD -- CLAUDE.md
  EXPECTED="$WORKTREE"
  OUT="$BATS_TEST_TMPDIR/fs-cwd-worktree.out"
  run nvim -l "$PROBE_DIR/find-file-cwd.lua" "$STAGE" "$WORKTREE/CLAUDE.md" "$OUT"
  [ "$status" -eq 0 ]
  run diff <(printf '%s\n' "$EXPECTED") "$OUT"
  [ "$status" -eq 0 ]
  git -C "$REPO" worktree remove --force "$WORKTREE"
}

@test "neovim-dashboard: find-file resolves space-containing repo to toplevel" {
  write_findfile_cwd_probe
  SCRATCH="$BATS_TEST_TMPDIR/nv space/repo"
  mkdir -p "$SCRATCH/nested"
  git -C "$SCRATCH" init -q
  printf 'x\n' > "$SCRATCH/nested/file.txt"
  EXPECTED="$(cd "$SCRATCH" && git rev-parse --show-toplevel)"
  OUT="$BATS_TEST_TMPDIR/fs-cwd-space.out"
  run nvim -l "$PROBE_DIR/find-file-cwd.lua" "$STAGE" "$SCRATCH/nested/file.txt" "$OUT"
  [ "$status" -eq 0 ]
  run diff <(printf '%s\n' "$EXPECTED") "$OUT"
  [ "$status" -eq 0 ]
}

# ── T900657 p2: runbook coverage ────────────────────────────────────────────
@test "neovim-dashboard: files-search runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/files-search.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/files-search.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next}' "$RUNBOOK")"
  EXPECTED="$(printf 'find-file\nlive-grep\nbuffers\nrecent-files\nrelated-open')"
  if [ "$ACTIONS" != "$EXPECTED" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done

  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECTED_STEPS="$(printf '%s\n' find-file live-grep buffers recent-files related-open)"
  if [ "$STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
}

# ── T900659 p2: module shape ────────────────────────────────────────────────
write_github_shape_probe() {
  cat > "$PROBE_DIR/github-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.github')
if not ok then
  io.stderr:write('LOAD FAILED config.github:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
local want = { 'branch_status', 'diff_view', 'pr_view', 'review_list', 'pr_checks',
  'failure_logs', 'release_view', 'pr_merge', 'branch_cleanup', 'target', 'confirm_or_abort' }
for _, fn in ipairs(want) do
  if type(m[fn]) ~= 'function' then
    io.stderr:write('missing ' .. fn .. '\n')
    os.exit(1)
  end
end
print('all eleven functions exist')
os.exit(0)
LUA
}

@test "neovim-dashboard: github module exposes nine actions plus target and guard" {
  write_github_shape_probe
  run nvim -l "$PROBE_DIR/github-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all eleven functions exist"* ]]
}

# ── T900659 p2: page order with distinct keys ───────────────────────────────
write_github_order_probe() {
  cat > "$PROBE_DIR/github-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('github')
local f = io.open(outfile, 'w')
for _, r in ipairs(rows[3]) do
  if r.name then
    f:write(r.key .. '\t' .. r.name .. '\n')
  end
end
f:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: github page lists nine actions in order with distinct keys" {
  write_github_order_probe
  OUT="$BATS_TEST_TMPDIR/github-order.out"
  run nvim -l "$PROBE_DIR/github-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  EXPECTED="$(printf 'b\tbranch-status\nd\tdiff-view\np\tpr-view\nr\treview-list\nc\tpr-checks\nl\tfailure-logs\nv\trelease-view\nm\tpr-merge\nx\tbranch-cleanup\n')"
  run diff <(printf '%s\n' "$EXPECTED") "$OUT"
  [ "$status" -eq 0 ]
}

# ── T900659 p2: guard decline-aborts / accept-runs ──────────────────────────
write_github_guard_probe() {
  cat > "$PROBE_DIR/github-guard.lua" <<'LUA'
local stage, choice, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.github')
if not ok then
  io.stderr:write('LOAD FAILED config.github\n')
  os.exit(1)
end
-- Target triple is stubbed (its own resolution is covered by the gitroot
-- tests); the guard behavior under test is decline-runs-nothing vs
-- accept-runs-the-canonical-command.
m.target = function()
  return { repo = 'o/r', branch = 'feature/x', pr = '42', cwd = '/tmp' }
end
vim.fn.confirm = function() return tonumber(choice) end
vim.notify = function() end
local recorded = {}
vim.system = function(argv, opts)
  recorded[#recorded + 1] = table.concat(argv, ' ')
  return { wait = function() return { code = 0, stdout = 'ok', stderr = '' } end }
end
local okc, err = pcall(m.pr_merge, '/tmp')
if not okc then
  io.stderr:write('PR_MERGE FAILED: ' .. tostring(err) .. '\n')
  os.exit(1)
end
local f = io.open(outfile, 'w')
f:write('count=' .. #recorded .. '\n')
for _, c in ipairs(recorded) do
  f:write(c .. '\n')
end
f:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: github guard decline runs zero external commands" {
  write_github_guard_probe
  OUT="$BATS_TEST_TMPDIR/github-guard-decline.out"
  run nvim -l "$PROBE_DIR/github-guard.lua" "$STAGE" "2" "$OUT"
  [ "$status" -eq 0 ]
  run diff <(printf 'count=0\n') "$OUT"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: github guard accept runs the recorded squash-merge command" {
  write_github_guard_probe
  OUT="$BATS_TEST_TMPDIR/github-guard-accept.out"
  run nvim -l "$PROBE_DIR/github-guard.lua" "$STAGE" "1" "$OUT"
  [ "$status" -eq 0 ]
  run diff <(printf 'count=1\ngh pr merge 42 --squash\n') "$OUT"
  [ "$status" -eq 0 ]
}

# ── T900659 p2: no format-on-save ───────────────────────────────────────────
write_github_noformat_probe() {
  cat > "$PROBE_DIR/github-noformat.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.github')
if not ok then
  io.stderr:write('LOAD FAILED config.github: ' .. tostring(m) .. '\n')
  os.exit(1)
end
if type(m.branch_status) ~= 'function' then
  io.stderr:write('config.github did not expose its actions\n')
  os.exit(1)
end
local au = vim.api.nvim_get_autocmds({ event = 'BufWritePre' })
print('bufwritepre_count=' .. #au)
os.exit(0)
LUA
}

@test "neovim-dashboard: github module creates zero BufWritePre autocmds" {
  write_github_noformat_probe
  run nvim -l "$PROBE_DIR/github-noformat.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"bufwritepre_count=0"* ]]
}

# ── T900659 p2: runbook coverage ────────────────────────────────────────────
@test "neovim-dashboard: github runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/github.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/github.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  run grep -q '^ticket: T900659' "$RUNBOOK"
  [ "$status" -eq 0 ]

  # Live dashboard page order is the oracle for both actions[] and steps.
  write_github_order_probe
  PAGE_OUT="$BATS_TEST_TMPDIR/github-page-names.out"
  run nvim -l "$PROBE_DIR/github-order.lua" "$STAGE" "$BATS_TEST_TMPDIR/github-page-kv.out"
  [ "$status" -eq 0 ]
  cut -f2 "$BATS_TEST_TMPDIR/github-page-kv.out" > "$PAGE_OUT"

  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' "$RUNBOOK")"
  run diff <(printf '%s\n' "$ACTIONS") "$PAGE_OUT"
  [ "$status" -eq 0 ]

  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done

  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  run diff <(printf '%s\n' "$STEPS") "$PAGE_OUT"
  [ "$status" -eq 0 ]
}


# ── T900660 sdlc chapter ──
write_sdlc_shape_probe() {
  cat > "$PROBE_DIR/sdlc-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.sdlc')
if not ok then
  io.stderr:write('LOAD FAILED config.sdlc\n')
  os.exit(1)
end
for _, f in ipairs({'list_tickets','show_triage','show_readiness','show_deps','open_plan','exec_status','show_gates','close_check','open_process_docs'}) do
  if type(m[f]) ~= 'function' then
    io.stderr:write('missing ' .. f .. '\n')
    os.exit(1)
  end
end
print('nine functions exist')
os.exit(0)
LUA
}

@test "neovim-dashboard: T900660 sdlc module exposes nine functions" {
  write_sdlc_shape_probe
  run nvim -l "$PROBE_DIR/sdlc-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"nine functions exist"* ]]
}

write_sdlc_order_probe() {
  cat > "$PROBE_DIR/sdlc-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, dashboard = pcall(require, 'config.dashboard')
if not ok then
  io.stderr:write('LOAD FAILED config.dashboard\n')
  os.exit(1)
end
local rows = dashboard.sections('sdlc')
local f = io.open(outfile, 'w')
for _, r in ipairs(rows[3]) do
  if r.name then
    f:write(r.name .. '\n')
  end
end
f:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: T900660 sdlc page lists nine actions in order" {
  write_sdlc_order_probe
  OUT="$BATS_TEST_TMPDIR/sdlc-order.out"
  run nvim -l "$PROBE_DIR/sdlc-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  run cat "$OUT"
  EXPECTED="$(printf 'tickets-list\ntriage-show\nreadiness-show\ndeps-show\nplan-open\nexec-status\nverify-gates\nclose-check\nprocess-docs\n')"
  run diff - <<< "$EXPECTED" "$OUT"
  [ "$status" -eq 0 ]
}

write_sdlc_noop_probe() {
  cat > "$PROBE_DIR/sdlc-noop.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local notes = {}
vim.notify = function(msg, _level) notes[#notes + 1] = tostring(msg) end
local ok, m = pcall(require, 'config.sdlc')
if not ok then
  io.stderr:write('LOAD FAILED config.sdlc\n')
  os.exit(1)
end
-- Unnamed buffer: no :edit call, so no project is resolvable.
local ok1 = pcall(m.list_tickets)
local ok2 = pcall(m.show_triage)
local sdlc_bufs = 0
for _, b in ipairs(vim.api.nvim_list_bufs()) do
  if vim.bo[b].filetype == 'sdlc' then
    sdlc_bufs = sdlc_bufs + 1
  end
end
local f = io.open(outfile, 'w')
f:write('list_ok=' .. tostring(ok1) .. '\n')
f:write('triage_ok=' .. tostring(ok2) .. '\n')
for _, n in ipairs(notes) do
  f:write('note=' .. n .. '\n')
end
f:write('sdlc_bufs=' .. sdlc_bufs .. '\n')
f:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: T900660 sdlc actions no-op with a warning outside any checkout" {
  write_sdlc_noop_probe
  OUT="$BATS_TEST_TMPDIR/sdlc-noop.out"
  run nvim -l "$PROBE_DIR/sdlc-noop.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^list_ok=true$' "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^triage_ok=true$' "$OUT"
  [ "$status" -eq 0 ]
  run grep -q 'no project' "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^sdlc_bufs=0$' "$OUT"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: T900660 sdlc runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/sdlc.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/sdlc.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next}' "$RUNBOOK")"
  EXPECTED="$(printf 'tickets-list\ntriage-show\nreadiness-show\ndeps-show\nplan-open\nexec-status\nverify-gates\nclose-check\nprocess-docs')"
  if [ "$ACTIONS" != "$EXPECTED" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done

  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECTED_STEPS="$(printf '%s\n' tickets-list triage-show readiness-show deps-show plan-open exec-status verify-gates close-check process-docs)"
  if [ "$STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
}

@test "neovim-dashboard: T900660 sdlc files carry no OpenSpec references" {
  run grep -r -i openspec "$STAGE/lua/config/sdlc.lua" "$STAGE/lua/config/dashboard.lua" "$STAGE/runbooks/sdlc.md"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}


# ── T900664 p2: module shape ───────────────────────────────────────────────
@test "neovim-dashboard: T900664 infrastructure module exposes six functions with fleet/workspace state" {
  cat > "$PROBE_DIR/infra-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.infrastructure')
if not ok then
  io.stderr:write('LOAD FAILED config.infrastructure: ' .. tostring(m) .. '\n')
  os.exit(1)
end
for _, fn in ipairs({ 'cluster_status', 'pods', 'services', 'pod_logs', 'context_select', 'setup_checklist' }) do
  if type(m[fn]) ~= 'function' then
    io.stderr:write('missing function: ' .. fn .. '\n')
    os.exit(1)
  end
end
if m.state.context ~= 'fleet' or m.state.namespace ~= 'workspace' then
  io.stderr:write('bad state defaults\n')
  os.exit(1)
end
print('infra shape OK')
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/infra-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"infra shape OK"* ]]
}

# ── T900664 p2: page order ─────────────────────────────────────────────────
@test "neovim-dashboard: T900664 infrastructure page lists six actions in order with Status link last" {
  cat > "$PROBE_DIR/infra-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('infrastructure')
local names = {}
for _, r in ipairs(rows[3]) do
  if r.name then
    names[#names + 1] = r.name
  end
end
local last = rows[3][#rows[3]]
local f = io.open(outfile, 'w')
for _, n in ipairs(names) do
  f:write(n .. '\n')
end
f:write('last_key=' .. tostring(last.key) .. '\n')
f:write('last_desc=' .. tostring(last.desc) .. '\n')
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/infra-order.out"
  run nvim -l "$PROBE_DIR/infra-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  EXPECTED="$(printf 'cluster-status\npods\nservices\npod-logs\ncontext-select\nsetup-checklist\n')"
  run diff <(printf '%s\n' "$EXPECTED") <(head -n 6 "$OUT")
  [ "$status" -eq 0 ]
  run grep -q '^last_key=s$' "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^last_desc=Status  >$' "$OUT"
  [ "$status" -eq 0 ]
}

# ── T900664 p2: korczewski refusal ─────────────────────────────────────────
@test "neovim-dashboard: T900664 context-select refuses korczewski without switching" {
  command -v kubectl >/dev/null 2>&1 || skip "kubectl fehlt"
  cat > "$PROBE_DIR/infra-refusal.lua" <<'LUA'
local stage, marker_file, out_file = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
vim.notify = function(msg, level)
  local f = io.open(marker_file, 'a')
  f:write('level=' .. tostring(level) .. ' msg=' .. tostring(msg) .. '\n')
  f:close()
end
local system_calls = 0
vim.system = function()
  system_calls = system_calls + 1
  error('vim.system must not be called on the refusal path')
end
vim.ui.select = function(items, opts, on_choice)
  on_choice('devmesh')
end
vim.ui.input = function(opts, on_confirm)
  on_confirm('korczewski')
end
local infra = require('config.infrastructure')
local before_ctx, before_ns = infra.state.context, infra.state.namespace
local ok_exec = pcall(infra.context_select, '/tmp')
local out = io.open(out_file, 'w')
out:write('execute_ok=' .. tostring(ok_exec) .. '\n')
out:write('system_calls=' .. tostring(system_calls) .. '\n')
out:write('state_unchanged=' .. tostring(before_ctx == infra.state.context and before_ns == infra.state.namespace) .. '\n')
out:close()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/infra-refusal-marker.txt"
  OUT="$BATS_TEST_TMPDIR/infra-refusal.out"
  run nvim -l "$PROBE_DIR/infra-refusal.lua" "$STAGE" "$MARKER" "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^execute_ok=true$' "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^system_calls=0$' "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^state_unchanged=true$' "$OUT"
  [ "$status" -eq 0 ]
  [ -s "$MARKER" ] || fail "refusal probe produced no notification marker"
  run grep -q 'current: context=fleet namespace=workspace' "$MARKER"
  [ "$status" -eq 0 ]
  run grep -q 'refusing korczewski' "$MARKER"
  [ "$status" -eq 0 ]
  run grep -q 'suspend: true' "$MARKER"
  [ "$status" -eq 0 ]
  run grep -q 'T002479' "$MARKER"
  [ "$status" -eq 0 ]
  run bash -c "grep -q 'level=4' '$MARKER'"
  [ "$status" -ne 0 ]
}

# ── T900664 p2: kubectl-missing degradation ────────────────────────────────
@test "neovim-dashboard: T900664 actions degrade with warning when kubectl is missing" {
  cat > "$PROBE_DIR/infra-nokubectl.lua" <<'LUA'
local stage, marker_file, out_file = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
-- vim.fn carries no __newindex, so this raw key shadows the real executable.
vim.fn.executable = function() return 0 end
local saw_system = false
vim.system = function()
  saw_system = true
  error('must not spawn without kubectl')
end
vim.notify = function(msg, level)
  local f = io.open(marker_file, 'a')
  f:write('level=' .. tostring(level) .. ' msg=' .. tostring(msg) .. '\n')
  f:close()
end
local infra = require('config.infrastructure')
local ok = pcall(infra.cluster_status, '/tmp')
local out = io.open(out_file, 'w')
out:write('execute_ok=' .. tostring(ok) .. '\n')
out:write('saw_system=' .. tostring(saw_system) .. '\n')
out:close()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/infra-nokubectl-marker.txt"
  OUT="$BATS_TEST_TMPDIR/infra-nokubectl.out"
  run nvim -l "$PROBE_DIR/infra-nokubectl.lua" "$STAGE" "$MARKER" "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^execute_ok=true$' "$OUT"
  [ "$status" -eq 0 ]
  run grep -q '^saw_system=false$' "$OUT"
  [ "$status" -eq 0 ]
  [ -s "$MARKER" ] || fail "degradation probe produced no notification marker"
  run grep -q 'level=3.*kubectl not found on PATH' "$MARKER"
  [ "$status" -eq 0 ]
  run bash -c "grep -q 'level=4' '$MARKER'"
  [ "$status" -ne 0 ]
}

# ── T900664 p2: runbook coverage ───────────────────────────────────────────
@test "neovim-dashboard: T900664 infrastructure runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/infrastructure.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/infrastructure.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next}' "$RUNBOOK")"
  EXPECTED="$(printf 'cluster-status\npods\nservices\npod-logs\ncontext-select\nsetup-checklist\nNode Control\nStatus')"
  if [ "$ACTIONS" != "$EXPECTED" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done

  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECTED_STEPS="$(printf '%s\n' cluster-status pods services pod-logs context-select setup-checklist 'node control' status)"
  if [ "$STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
}


# ── T900800: infrastructure-node sub-page ─────────────────────────────────
@test "neovim-dashboard: infrastructure-node page exists and renders flat rows" {
  cat > "$PROBE_DIR/node-page.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local spec = dashboard.pages['infrastructure-node']
if not spec then
  io.stderr:write('infrastructure-node page missing\n')
  os.exit(1)
end
local ok, rows = pcall(spec.rows)
if not ok then
  io.stderr:write('node rows failed: ' .. tostring(rows) .. '\n')
  os.exit(1)
end
if type(rows) ~= 'table' or #rows == 0 then
  io.stderr:write('infrastructure-node page rendered no rows\n')
  os.exit(1)
end
local f = io.open(outfile, 'w')
for _, r in ipairs(rows) do
  f:write(tostring(r.desc) .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/node-page.out"
  run nvim -l "$PROBE_DIR/node-page.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  [ -s "$OUT" ] || fail "infrastructure-node page rendered no rows"
}

# ── T900666 comfyui-images chapter tests ──
@test "neovim-dashboard: comfyui-images module exposes nine functions in order" {
  cat > "$PROBE_DIR/comfyui-shape.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.comfyui-images')
if not ok then
  io.stderr:write('LOAD FAILED config.comfyui-images:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
local want = { 'status', 'queue', 'logs', 'start', 'use', 'troubleshoot', 'has_active_jobs', 'unload', 'stop' }
local last_line = 0
local f = io.open(outfile, 'w')
for _, fn in ipairs(want) do
  if type(m[fn]) ~= 'function' then
    io.stderr:write('missing function: ' .. fn .. '\n')
    os.exit(1)
  end
  local line = debug.getinfo(m[fn], 'S').linedefined or 0
  f:write(fn .. ' ' .. tostring(line) .. '\n')
  if line <= last_line then
    io.stderr:write('order violation at: ' .. fn .. '\n')
    os.exit(1)
  end
  last_line = line
end
f:close()
print('all nine functions exist in order')
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/comfyui-shape.out"
  run nvim -l "$PROBE_DIR/comfyui-shape.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all nine functions exist in order"* ]]
  run diff <(printf 'status\nqueue\nlogs\nstart\nuse\ntroubleshoot\nhas_active_jobs\nunload\nstop\n') <(awk '{print $1}' "$OUT")
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: comfyui-images page lists eight actions in order" {
  cat > "$PROBE_DIR/comfyui-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('comfyui-images')
local names = {}
for _, r in ipairs(rows[3]) do
  if r.name then
    names[#names + 1] = r.name
  end
end
local f = io.open(outfile, 'w')
for _, n in ipairs(names) do
  f:write(n .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/comfyui-order.out"
  run nvim -l "$PROBE_DIR/comfyui-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  run diff <(printf 'status\nqueue\nlogs\nstart\nuse\ntroubleshoot\nunload\nstop\n') "$OUT"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: comfyui-images focus runs nothing, the explicit step does" {
  cat > "$PROBE_DIR/comfyui-focus.lua" <<'LUA'
local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. package.path
vim.notify = function(msg, level)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end
-- No subprocess and no network in this probe: every system() call is
-- recorded and answers empty (curl "fails" instantly).
local syscalls = {}
vim.fn.system = function(cmd, ...)
  local s = type(cmd) == 'table' and table.concat(cmd, ' ') or tostring(cmd)
  syscalls[#syscalls + 1] = s
  return ''
end
_G.Snacks = {
  dashboard = function(opts) return { win = nil, opts = opts } end,
  picker = {
    pick = function(opts)
      local item = opts.items[1]
      if opts.confirm then opts.confirm({ close = function() end }, item) end
    end,
  },
}
local dashboard = require('config.dashboard')
-- Phase 1: open the chapter page, home, and drive search-focus. Nothing executes.
dashboard.show('comfyui-images')
dashboard.show('home')
dashboard.search()
local mf1 = io.open(marker_file, 'r')
local phase1_marker_exists = mf1 ~= nil
if mf1 then mf1:close() end
local rows = dashboard.sections('comfyui-images')
local status_row = rows[3][1]
local out = io.open(out_file, 'w')
out:write('phase1_marker_exists=' .. tostring(phase1_marker_exists) .. '\n')
out:write('status_row=' .. tostring(status_row and status_row.name or 'MISSING') .. '\n')
-- Phase 2: explicit step from a buffer inside a real checkout.
vim.cmd.edit(vim.fn.fnameescape(repo_file))
if status_row then status_row.action() end
local mf2 = io.open(marker_file, 'r')
local phase2_marker_exists = mf2 ~= nil
if mf2 then mf2:close() end
out:write('phase2_marker_exists=' .. tostring(phase2_marker_exists) .. '\n')
out:write('syscalls=' .. tostring(#syscalls) .. '\n')
out:close()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/comfyui-focus-marker.txt"
  OUT="$BATS_TEST_TMPDIR/comfyui-focus.out"
  COMFY_HOST_IP=192.0.2.1 nvim -l "$PROBE_DIR/comfyui-focus.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  run grep '^phase1_marker_exists=' "$OUT"
  [[ "$output" == *"phase1_marker_exists=false"* ]]
  run grep '^status_row=' "$OUT"
  [[ "$output" == *"status_row=status"* ]]
  run grep '^phase2_marker_exists=' "$OUT"
  [[ "$output" == *"phase2_marker_exists=true"* ]]
  [ -s "$MARKER" ]
}

@test "neovim-dashboard: comfyui-images guard is fail-closed and unload/stop refuse without shelling out" {
  cat > "$PROBE_DIR/comfyui-guard.lua" <<'LUA'
local stage, repo_file, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
local calls = {}
vim.fn.system = function(cmd, ...)
  local s = type(cmd) == 'table' and table.concat(cmd, ' ') or tostring(cmd)
  calls[#calls + 1] = s
  return '' -- unreachable queue: every curl answers empty
end
local notifies = {}
vim.notify = function(msg, level)
  notifies[#notifies + 1] = tostring(msg)
end
local m = require('config.comfyui-images')
vim.cmd.edit(vim.fn.fnameescape(repo_file))
local guard = m.has_active_jobs()
m.unload()
m.stop()
local f = io.open(outfile, 'w')
f:write('guard=' .. tostring(guard) .. '\n')
for i, c in ipairs(calls) do
  f:write('call' .. i .. '=' .. c .. '\n')
end
for i, n in ipairs(notifies) do
  f:write('notify' .. i .. '=' .. n .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/comfyui-guard.out"
  COMFY_HOST_IP=192.0.2.1 nvim -l "$PROBE_DIR/comfyui-guard.lua" "$STAGE" "$REPO/CLAUDE.md" "$OUT"
  run grep '^guard=' "$OUT"
  [[ "$output" == *"guard=true"* ]]
  # Exactly the three guard probes (GET /queue), nothing destructive.
  run bash -c "grep -c '^call' '$OUT'"
  [ "$output" -eq 3 ]
  run bash -c "grep '^call' '$OUT' | grep -c '/queue'"
  [ "$output" -eq 3 ]
  run bash -c "grep '^call' '$OUT' | grep -c '/free' || true"
  [ "$output" -eq 0 ]
  run bash -c "grep '^call' '$OUT' | grep -c 'screen' || true"
  [ "$output" -eq 0 ]
  run grep -c 'refusing unload' "$OUT"
  [ "$output" -eq 1 ]
  run grep -c 'refusing stop' "$OUT"
  [ "$output" -eq 1 ]
}

@test "neovim-dashboard: comfyui-images runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/comfyui-images.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/comfyui-images.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next}' "$RUNBOOK")"
  EXPECTED="$(printf 'status\nqueue\nlogs\nstart\nuse\ntroubleshoot\nunload\nstop')"
  if [ "$ACTIONS" != "$EXPECTED" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done
  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECTED_STEPS="$(printf '%s\n' status queue logs start use troubleshoot unload stop)"
  if [ "$STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
}


# ── T900662 ai-agents ─────────────────────────────────────────────────

# ── T900662 ai-agents: module shape (a) ───────────────────────────────
@test "neovim-dashboard: T900662 ai-agents module exposes five functions" {
  cat > "$PROBE_DIR/ai-agents-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.ai-agents')
if not ok then
  io.stderr:write('LOAD FAILED config.ai-agents:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
for _, fn in ipairs({ 'ask', 'select', 'send_context', 'list_skills', 'session_new' }) do
  if type(m[fn]) ~= 'function' then
    io.stderr:write('missing ' .. fn .. '\n')
    os.exit(1)
  end
end
print('all five ai-agents functions exist')
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/ai-agents-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all five ai-agents functions exist"* ]]
}

# ── T900662 ai-agents: page order + action-model shape (b) ───────────
@test "neovim-dashboard: T900662 ai-agents page lists five actions in order with full action-model shape" {
  cat > "$PROBE_DIR/ai-agents-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('ai-agents')
local f = io.open(outfile, 'w')
for _, r in ipairs(rows[3]) do
  if r.name then
    f:write('name=' .. r.name .. '\n')
    f:write('shape=' .. tostring(r.name ~= nil)
      .. ',' .. tostring(r.inputs ~= nil)
      .. ',' .. tostring(type(r.effect) == 'function')
      .. ',' .. tostring(type(r.on_error) == 'function') .. '\n')
  end
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/ai-agents-order.out"
  run nvim -l "$PROBE_DIR/ai-agents-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  NAMES="$(grep '^name=' "$OUT" | sed 's/^name=//')"
  EXPECTED="$(printf 'ask\nselect\nsend-context\nlist-skills\nsession-new')"
  [ "$NAMES" = "$EXPECTED" ] || fail "ai-agents page order mismatch"
  SHAPES="$(grep -c '^shape=true,true,true,true' "$OUT")"
  [ "$SHAPES" -eq 5 ] || fail "ai-agents action-model shape incomplete"
}

# ── T900662 ai-agents: focus-before-execute (c) ───────────────────────
write_ai_agents_focus_probe() {
  cat > "$PROBE_DIR/ai-agents-focus.lua" <<'LUA'
local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. package.path
-- Test-only marker: any vim.notify call appends to marker_file. Building
-- or focusing a page never calls gitroot/effect, so it must never write
-- here; only the explicit execute step does (via the fake opencode below).
vim.notify = function(msg)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end
_G.Snacks = { dashboard = function(opts) return { win = nil, opts = opts } end }
-- Fake opencode recorder: any real call notifies (== writes the marker).
-- package.preload entries must be FUNCTIONS returning the module table
-- (Lua 5.1 silently skips preload tables).
package.preload['opencode'] = function()
  return {
    ask = function(a) vim.notify('opencode.ask ' .. tostring(a)) end,
    select = function() vim.notify('opencode.select') end,
    prompt = function(p) vim.notify('opencode.prompt ' .. tostring(p)) end,
    command = function(c) vim.notify('opencode.command ' .. tostring(c)) end,
  }
end
local dashboard = require('config.dashboard')
dashboard.show('ai-agents')
dashboard.focus({ text = 'send-context', page = 'ai-agents', key = 'c' })
local mf1 = io.open(marker_file, 'r')
local phase1 = mf1 ~= nil
if mf1 then mf1:close() end
local rows = dashboard.sections('ai-agents')
local row
for _, r in ipairs(rows[3]) do
  if r.name == 'send-context' then row = r end
end
local out = io.open(out_file, 'w')
out:write('phase1_marker_exists=' .. tostring(phase1) .. '\n')
vim.cmd.edit(vim.fn.fnameescape(repo_file))
if row then row.action() end
local mf2 = io.open(marker_file, 'r')
out:write('phase2_marker_exists=' .. tostring(mf2 ~= nil) .. '\n')
if mf2 then mf2:close() end
out:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: T900662 focusing the ai-agents page runs nothing; the explicit step does" {
  write_ai_agents_focus_probe
  MARKER="$BATS_TEST_TMPDIR/ai-agents-marker.txt"
  OUT="$BATS_TEST_TMPDIR/ai-agents-focus.out"
  run nvim -l "$PROBE_DIR/ai-agents-focus.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  [ "$status" -eq 0 ]
  run grep '^phase1_marker_exists=' "$OUT"
  [[ "$output" == *"phase1_marker_exists=false"* ]]
  run grep '^phase2_marker_exists=' "$OUT"
  [[ "$output" == *"phase2_marker_exists=true"* ]]
  run grep -q 'opencode.prompt @buffer @diagnostics ' "$MARKER"
  [ "$status" -eq 0 ]
}

# ── T900662 ai-agents: live skills listing (d) ────────────────────────
@test "neovim-dashboard: T900662 muse skills list exits 0 with a header line" {
  command -v muse >/dev/null 2>&1 || skip "muse CLI fehlt"
  OUT="$BATS_TEST_TMPDIR/ai-agents-skills.out"
  run muse skills list --source all
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" > "$OUT"
  run head -1 "$OUT"
  [[ "$output" == NAME* ]]
  [[ "$output" == *SCOPE* ]]
}

# ── T900662 ai-agents: runbook coverage (e) ───────────────────────────
@test "neovim-dashboard: T900662 ai-agents runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/ai-agents.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/ai-agents.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next}' "$RUNBOOK")"
  EXPECTED="$(printf 'ask\nselect\nsend-context\nlist-skills\nsession-new')"
  if [ "$ACTIONS" != "$EXPECTED" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done
  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECTED_STEPS="$(printf '%s\n' ask select send-context list-skills session-new)"
  if [ "$STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
  # Category-workflow mapping table + Blink delineation markers.
  run grep -q '| session lifecycle |' "$RUNBOOK"
  [ "$status" -eq 0 ]
  run grep -q 'setup_blink()' "$RUNBOOK"
  [ "$status" -eq 0 ]
  run grep -q 'keine Agenten-Verdrahtung' "$RUNBOOK"
  [ "$status" -eq 0 ]
}


# ── T900667 settings-help ──
@test "neovim-dashboard: settings-help module exposes eight action functions" {
  cat > "$PROBE_DIR/sh-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.settings-help')
if not ok then
  io.stderr:write('LOAD FAILED config.settings-help:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
for _, f in ipairs({'open_config_source','sync_status','plugins','health','keybindings','reload','backup','recover'}) do
  if type(m[f]) ~= 'function' then
    io.stderr:write('missing ' .. f .. '\n')
    os.exit(1)
  end
end
print('all eight functions exist')
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/sh-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all eight functions exist"* ]]
}

@test "neovim-dashboard: settings-help page lists eight actions in order" {
  cat > "$PROBE_DIR/sh-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('settings-help')
local f = io.open(outfile, 'w')
for _, r in ipairs(rows[3]) do
  if r.name then
    f:write(r.name .. '\n')
  end
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/sh-order.out"
  run nvim -l "$PROBE_DIR/sh-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  EXPECTED="$(printf 'open-config-source\nsync-status\nplugins\nhealth\nkeybindings\nreload-config\nbackup-config\nrecover-config\n')"
  run diff <(printf '%s\n' "$EXPECTED") "$OUT"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: settings-help open-config-source targets the repo init.lua" {
  SCRATCH="$BATS_TEST_TMPDIR/sh-src-scratch"
  mkdir -p "$SCRATCH/dotfiles/nvim" "$SCRATCH/nested"
  git -C "$SCRATCH" init -q
  printf -- '-- scratch init\n' > "$SCRATCH/dotfiles/nvim/init.lua"
  printf 'x\n' > "$SCRATCH/nested/file.txt"
  EXPECTED="$(cd "$SCRATCH" && git rev-parse --show-toplevel)/dotfiles/nvim/init.lua"
  cat > "$PROBE_DIR/sh-open.lua" <<'LUA'
local stage, target, expected, outfile = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.settings-help')
if not ok then
  io.stderr:write('LOAD FAILED\n')
  os.exit(1)
end
vim.cmd.edit(vim.fn.fnameescape(target))
local recorded = nil
vim.cmd.edit = function(p) recorded = p end
local got = m.open_config_source()
local f = io.open(outfile, 'w')
f:write('recorded=' .. tostring(recorded) .. '\n')
f:write('returned=' .. tostring(got) .. '\n')
f:write('expected_escaped=' .. vim.fn.fnameescape(expected) .. '\n')
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/sh-open.out"
  run nvim -l "$PROBE_DIR/sh-open.lua" "$STAGE" "$SCRATCH/nested/file.txt" "$EXPECTED" "$OUT"
  [ "$status" -eq 0 ]
  RECORDED="$(grep '^recorded=' "$OUT" | cut -d= -f2-)"
  RETURNED="$(grep '^returned=' "$OUT" | cut -d= -f2-)"
  WANT_ESCAPED="$(grep '^expected_escaped=' "$OUT" | cut -d= -f2-)"
  [ "$RECORDED" = "$WANT_ESCAPED" ]
  [ "$RETURNED" = "$EXPECTED" ]
}

@test "neovim-dashboard: settings-help sync-status reports in-sync and differs" {
  ROOT="$BATS_TEST_TMPDIR/sh-sync-root"
  mkdir -p "$ROOT/nested"
  git -C "$ROOT" init -q
  printf 'x\n' > "$ROOT/nested/file.txt"
  mkdir -p "$ROOT/dotfiles"
  cp -r "$STAGE" "$ROOT/dotfiles/nvim"
  cat > "$PROBE_DIR/sh-sync.lua" <<'LUA'
local stage, target, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.settings-help')
if not ok then
  io.stderr:write('LOAD FAILED\n')
  os.exit(1)
end
vim.cmd.edit(vim.fn.fnameescape(target))
local state = m.sync_status()
local f = io.open(outfile, 'w')
f:write(tostring(state) .. '\n')
f:close()
os.exit(0)
LUA
  OUT_SYNC="$BATS_TEST_TMPDIR/sh-sync-insync.out"
  run nvim -l "$PROBE_DIR/sh-sync.lua" "$STAGE" "$ROOT/nested/file.txt" "$OUT_SYNC"
  [ "$status" -eq 0 ]
  [ "$(cat "$OUT_SYNC")" = "in-sync" ]

  printf -- '-- drift\n' >> "$ROOT/dotfiles/nvim/init.lua"
  OUT_DIFF="$BATS_TEST_TMPDIR/sh-sync-differs.out"
  run nvim -l "$PROBE_DIR/sh-sync.lua" "$STAGE" "$ROOT/nested/file.txt" "$OUT_DIFF"
  [ "$status" -eq 0 ]
  [ "$(cat "$OUT_DIFF")" = "differs" ]
}

@test "neovim-dashboard: settings-help reload sources a file and returns true" {
  MARKER_FILE="$BATS_TEST_TMPDIR/sh-reload-target.lua"
  printf 'vim.g.sh_reload_marker = "set-by-reload"\n' > "$MARKER_FILE"
  cat > "$PROBE_DIR/sh-reload.lua" <<'LUA'
local stage, target, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.settings-help')
if not ok then
  io.stderr:write('LOAD FAILED\n')
  os.exit(1)
end
local res = m.reload(target)
local f = io.open(outfile, 'w')
f:write('result=' .. tostring(res) .. '\n')
f:write('marker=' .. tostring(vim.g.sh_reload_marker) .. '\n')
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/sh-reload.out"
  run nvim -l "$PROBE_DIR/sh-reload.lua" "$STAGE" "$MARKER_FILE" "$OUT"
  [ "$status" -eq 0 ]
  grep -qx 'result=true' "$OUT"
  grep -qx 'marker=set-by-reload' "$OUT"
}

@test "neovim-dashboard: settings-help backup creates exactly one timestamped directory" {
  ls -d "$XDG_CONFIG_HOME"/nvim-backup-* 2>/dev/null | sort > "$BATS_TEST_TMPDIR/sh-backup-before.txt" || true
  cat > "$PROBE_DIR/sh-backup.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.settings-help')
if not ok then
  io.stderr:write('LOAD FAILED\n')
  os.exit(1)
end
local dst = m.backup()
local f = io.open(outfile, 'w')
f:write(tostring(dst) .. '\n')
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/sh-backup.out"
  run nvim -l "$PROBE_DIR/sh-backup.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  NEW_DST="$(cat "$OUT")"
  [ -n "$NEW_DST" ]
  [ "$NEW_DST" != "nil" ]
  [ -d "$NEW_DST" ]
  ls -d "$XDG_CONFIG_HOME"/nvim-backup-* 2>/dev/null | sort > "$BATS_TEST_TMPDIR/sh-backup-after.txt"
  ADDED="$(comm -13 "$BATS_TEST_TMPDIR/sh-backup-before.txt" "$BATS_TEST_TMPDIR/sh-backup-after.txt" | wc -l)"
  [ "$ADDED" -eq 1 ]
  grep -Fxq "$NEW_DST" "$BATS_TEST_TMPDIR/sh-backup-after.txt"
}

@test "neovim-dashboard: settings-help recover warns and changes nothing without backups" {
  ls -d "$XDG_CONFIG_HOME"/nvim-backup-* 2>/dev/null | sort > "$BATS_TEST_TMPDIR/sh-recover-before.txt" || true
  [ ! -s "$BATS_TEST_TMPDIR/sh-recover-before.txt" ] || fail "unexpected pre-existing backups in fresh XDG_CONFIG_HOME"
  cat > "$PROBE_DIR/sh-recover.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local notifies = {}
vim.notify = function(msg, level)
  notifies[#notifies + 1] = tostring(msg)
end
local ok, m = pcall(require, 'config.settings-help')
if not ok then
  io.stderr:write('LOAD FAILED\n')
  os.exit(1)
end
local state = m.recover()
local f = io.open(outfile, 'w')
f:write('state=' .. tostring(state) .. '\n')
f:write('notifies=' .. table.concat(notifies, ' | ') .. '\n')
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/sh-recover.out"
  run nvim -l "$PROBE_DIR/sh-recover.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  grep -qx 'state=no-backups' "$OUT"
  grep -q '^notifies=.*no backups' "$OUT"
  ls -d "$XDG_CONFIG_HOME"/nvim-backup-* 2>/dev/null | sort > "$BATS_TEST_TMPDIR/sh-recover-after.txt" || true
  run diff "$BATS_TEST_TMPDIR/sh-recover-before.txt" "$BATS_TEST_TMPDIR/sh-recover-after.txt"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: settings-help runbook matches the dashboard page" {
  RUNBOOK="$STAGE/runbooks/settings-help.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/settings-help.md missing in staged config"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  cat > "$PROBE_DIR/sh-rb-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('settings-help')
local f = io.open(outfile, 'w')
for _, r in ipairs(rows[3]) do
  if r.name then
    f:write(r.name .. '\n')
  end
end
f:close()
os.exit(0)
LUA
  DASH_OUT="$BATS_TEST_TMPDIR/sh-rb-order.out"
  run nvim -l "$PROBE_DIR/sh-rb-order.lua" "$STAGE" "$DASH_OUT"
  [ "$status" -eq 0 ]
  GOT="$BATS_TEST_TMPDIR/sh-rb-actions.txt"
  awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' \
    "$RUNBOOK" > "$GOT"
  run diff "$DASH_OUT" "$GOT"
  [ "$status" -eq 0 ]
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done
  run bash -c "grep -F -- '**Settings & Help**' '$STAGE/runbooks/README.md' | grep -q 'status: complete'"
  [ "$status" -eq 0 ]
}

# ── T900658 js-frontend BEGIN ──────────────────────────────────────────
# T900658 owns everything between BEGIN and END; other chapter tickets
# must not edit inside these markers.

# ── T900658: module shape ─────────────────────────────────────────────
@test "neovim-dashboard: T900658 js-frontend module exposes twelve functions" {
  cat > "$PROBE_DIR/js-frontend-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.js-frontend')
if not ok then
  io.stderr:write('LOAD FAILED config.js-frontend:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
local want = {
  'goto_page', 'goto_component', 'goto_layout', 'goto_route',
  'goto_design', 'dev', 'preview', 'lint', 'type_check', 'build',
  'test_cmd', 'lsp_status',
}
for _, f in ipairs(want) do
  if type(m[f]) ~= 'function' then
    io.stderr:write('missing or not a function: ' .. f .. '\n')
    os.exit(1)
  end
end
print('all twelve functions exist')
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/js-frontend-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all twelve functions exist"* ]]
}

# ── T900658: page order ───────────────────────────────────────────────
@test "neovim-dashboard: T900658 js-frontend page lists twelve actions in order" {
  cat > "$PROBE_DIR/js-frontend-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('js-frontend')
local names = {}
for _, r in ipairs(rows[3]) do
  if r.name then
    names[#names + 1] = r.name
  end
end
local f = io.open(outfile, 'w')
for _, n in ipairs(names) do
  f:write(n .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/js-frontend-order.out"
  run nvim -l "$PROBE_DIR/js-frontend-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  EXPECTED="$(printf 'goto-page\ngoto-component\ngoto-layout\ngoto-route\ngoto-design\ndev\npreview\nlint\ntype-check\nbuild\ntest\nlsp-status')"
  run diff <(printf '%s\n' "$EXPECTED") "$OUT"
  [ "$status" -eq 0 ]
}

# ── T900658: pnpm/npm package boundary ────────────────────────────────
write_js_frontend_boundary_probe() {
  cat > "$PROBE_DIR/js-frontend-boundary.lua" <<'LUA'
local stage, website_file, brett_file, root_file, outfile = arg[1], arg[2], arg[3], arg[4], arg[5]
package.path = stage .. '/lua/?.lua;' .. package.path
-- Fake toggleterm.terminal recorder: package.preload entries must be
-- FUNCTIONS returning the module table (Lua 5.1 silently skips
-- preload tables).
local recorded = {}
package.preload['toggleterm.terminal'] = function()
  return {
    Terminal = {
      new = function(_, opts)
        recorded[#recorded + 1] = opts or {}
        return { toggle = function() end }
      end,
    },
  }
end
local warnings = {}
vim.notify = function(msg, _)
  warnings[#warnings + 1] = tostring(msg)
end
local ok, m = pcall(require, 'config.js-frontend')
if not ok then
  io.stderr:write('LOAD FAILED config.js-frontend\n')
  os.exit(1)
end
local out = io.open(outfile, 'w')
local function run_case(label, file, action)
  recorded = {}
  warnings = {}
  vim.cmd.edit(vim.fn.fnameescape(file))
  local okc, err = pcall(m[action])
  if not okc then
    out:write(label .. ' ERROR ' .. tostring(err) .. '\n')
    return
  end
  if #recorded == 0 then
    out:write(label .. ' NO_TERMINAL warnings=' .. #warnings .. '\n')
    for _, w in ipairs(warnings) do
      out:write(label .. ' WARN ' .. w .. '\n')
    end
    return
  end
  for _, o in ipairs(recorded) do
    out:write(label .. ' CMD ' .. (o.cmd or 'NO_CMD') .. '\n')
    out:write(label .. ' DIR ' .. (o.dir or 'NO_DIR') .. '\n')
    out:write(label .. ' DIRECTION ' .. (o.direction or 'NO_DIRECTION') .. '\n')
  end
end
run_case('website-typecheck', website_file, 'type_check')
run_case('website-dev', website_file, 'dev')
run_case('brett-build', brett_file, 'build')
run_case('brett-preview', brett_file, 'preview')
run_case('root-typecheck', root_file, 'type_check')
run_case('root-dev', root_file, 'dev')
out:close()
os.exit(0)
LUA
}

@test "neovim-dashboard: T900658 js-frontend keeps the pnpm/npm package boundary" {
  write_js_frontend_boundary_probe
  WEBSITE_FILE="$REPO/components/website/src/pages/index.astro"
  BRETT_FILE="$REPO/components/brett/src/server/index.ts"
  ROOT_FILE="$REPO/CLAUDE.md"
  [ -f "$WEBSITE_FILE" ] || fail "boundary fixture missing: $WEBSITE_FILE"
  [ -f "$BRETT_FILE" ] || fail "boundary fixture missing: $BRETT_FILE"
  EXPECTED_ROOT="$(cd "$REPO" && git rev-parse --show-toplevel)"
  OUT="$BATS_TEST_TMPDIR/js-frontend-boundary.out"
  run nvim -l "$PROBE_DIR/js-frontend-boundary.lua" "$STAGE" "$WEBSITE_FILE" "$BRETT_FILE" "$ROOT_FILE" "$OUT"
  [ "$status" -eq 0 ]

  # Website buffers launch through pnpm; the launcher word must be
  # exactly `pnpm` (word-exact, since the substring "npm" also sits
  # inside "pnpm" and a substring check would be vacuous).
  run grep '^website-typecheck CMD pnpm ' "$OUT"
  [ "$status" -eq 0 ]
  run bash -c "grep -oE '^website-[a-z]+ CMD [^ ]+' '$OUT' | awk '{print \$3}' | sort -u"
  [ "$status" -eq 0 ]
  [ "$output" = "pnpm" ]
  run grep 'website-typecheck CMD .*astro:check' "$OUT"
  [ "$status" -eq 0 ]

  # Brett buffers launch through npm with the brett package dir.
  run grep '^brett-build CMD npm ' "$OUT"
  [ "$status" -eq 0 ]
  run grep 'brett-build CMD .*components/brett.*run build' "$OUT"
  [ "$status" -eq 0 ]

  # Missing scripts warn and open no terminal.
  run grep '^brett-preview NO_TERMINAL' "$OUT"
  [ "$status" -eq 0 ]
  run grep 'brett-preview WARN .*preview' "$OUT"
  [ "$status" -eq 0 ]
  run grep '^root-dev NO_TERMINAL' "$OUT"
  [ "$status" -eq 0 ]

  # Root buffers run only type-check, through npm at the root.
  run grep '^root-typecheck CMD npm .*run typecheck' "$OUT"
  [ "$status" -eq 0 ]

  # Every launched terminal opens horizontal at the project root.
  run bash -c "grep -c ' DIRECTION horizontal' '$OUT'"
  [ "$status" -eq 0 ]
  [ "$output" -eq 4 ]
  run bash -c "grep ' DIR ' '$OUT' | sed 's/.* DIR //' | sort -u"
  [ "$status" -eq 0 ]
  [ "$output" = "$EXPECTED_ROOT" ]
}

# ── T900658: runbook coverage ─────────────────────────────────────────
@test "neovim-dashboard: T900658 js-frontend runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/js-frontend.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/js-frontend.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next}' "$RUNBOOK")"
  EXPECTED="$(printf 'goto-page\ngoto-component\ngoto-layout\ngoto-route\ngoto-design\ndev\npreview\nlint\ntype-check\nbuild\ntest\nlsp-status')"
  if [ "$ACTIONS" != "$EXPECTED" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done

  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECTED_STEPS="$(printf '%s\n' goto-page goto-component goto-layout goto-route goto-design dev preview lint type-check build test lsp-status)"
  if [ "$STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
}

# ── T900658: no format-on-save ────────────────────────────────────────
@test "neovim-dashboard: T900658 js-frontend defines no format-on-save hook" {
  cat > "$PROBE_DIR/js-frontend-noformat.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, _ = pcall(require, 'config.js-frontend')
if not ok then
  io.stderr:write('LOAD FAILED config.js-frontend\n')
  os.exit(1)
end
local au = vim.api.nvim_get_autocmds({ event = 'BufWritePre' })
print('bufwritepre_count=' .. #au)
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/js-frontend-noformat.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"bufwritepre_count=0"* ]]
}

# ── T900658 js-frontend END ────────────────────────────────────────────

# ── T900663 models-inference ─────────────────────────────────────────────
# (a) module contract — the six chapter functions exist on the staged module
@test "neovim-dashboard: models-inference module exposes six functions" {
  cat > "$PROBE_DIR/models-inference-shape.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.models-inference')
if not ok then
  io.stderr:write('LOAD FAILED config.models-inference:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
local want = { 'status', 'show_config', 'logs', 'gpu', 'start_unit', 'stop_unit' }
local out = io.open(outfile, 'w')
for _, fn in ipairs(want) do
  if type(m[fn]) ~= 'function' then
    io.stderr:write('missing function: ' .. fn .. '\n')
    os.exit(1)
  end
  out:write('fn=' .. fn .. '\n')
end
out:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/models-inference-shape.out"
  run nvim -l "$PROBE_DIR/models-inference-shape.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  [ -s "$OUT" ] || fail "shape probe produced no output"
  for fn in status show_config logs gpu start_unit stop_unit; do
    grep -qx "fn=$fn" "$OUT" || fail "fn=$fn missing from module contract"
  done
}

# (b) page order — the dashboard page lists six actions in EPIC order
@test "neovim-dashboard: models-inference page lists six actions in order" {
  cat > "$PROBE_DIR/models-inference-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('models-inference')
local names = {}
for _, r in ipairs(rows[3]) do
  if r.name then
    names[#names + 1] = r.name
  end
end
local f = io.open(outfile, 'w')
for _, n in ipairs(names) do
  f:write(n .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/models-inference-order.out"
  run nvim -l "$PROBE_DIR/models-inference-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  EXPECTED="$(printf 'models-status\nserver-config\nserver-logs\ngpu-resources\nserver-start\nserver-stop\n')"
  run diff - <<< "$EXPECTED" "$OUT"
  [ "$status" -eq 0 ]
}

# (c) focus-before-execute — opening/focusing the page runs nothing; the
# explicit execute step does (write_action_probe marker technique)
@test "neovim-dashboard: models-inference focusing runs nothing, executing does" {
  cat > "$PROBE_DIR/models-inference-focus.lua" <<'LUA'
local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. package.path

-- Test-only marker: any vim.notify call appends to marker_file. Building
-- or focusing a page never calls gitroot/effect, so it must never write
-- here; only the explicit execute step (an action's effect) does.
vim.notify = function(msg, level)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end

-- Test-only stub: no real Snacks plugin in this headless probe.
_G.Snacks = {
  dashboard = function(opts) return { win = nil, opts = opts } end,
  picker = {
    pick = function(opts)
      local item = opts.items[1]
      if opts.confirm then opts.confirm({ close = function() end }, item) end
    end,
  },
}

local dashboard = require('config.dashboard')

-- Phase 1: open the chapter page and drive the search-focus path. No
-- action effect may run here.
dashboard.show('models-inference')
dashboard.show('home')
dashboard.search()

local mf1 = io.open(marker_file, 'r')
local phase1_marker_exists = mf1 ~= nil
if mf1 then mf1:close() end

local rows = dashboard.sections('models-inference')
local action_row = rows[3][1]

local out = io.open(out_file, 'w')
out:write('phase1_marker_exists=' .. tostring(phase1_marker_exists) .. '\n')

-- Phase 2: explicit execute step, from a buffer inside a real checkout.
vim.cmd.edit(vim.fn.fnameescape(repo_file))
if action_row then action_row.action() end

local mf2 = io.open(marker_file, 'r')
local phase2_marker_exists = mf2 ~= nil
if mf2 then mf2:close() end
out:write('phase2_marker_exists=' .. tostring(phase2_marker_exists) .. '\n')
out:close()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/models-inference-marker.txt"
  OUT="$BATS_TEST_TMPDIR/models-inference-focus.out"
  run nvim -l "$PROBE_DIR/models-inference-focus.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  [ "$status" -eq 0 ]
  run grep '^phase1_marker_exists=' "$OUT"
  [[ "$output" == *"phase1_marker_exists=false"* ]]
  run grep '^phase2_marker_exists=' "$OUT"
  [[ "$output" == *"phase2_marker_exists=true"* ]]
  [ -s "$MARKER" ]
}

# (d) runbook coverage — header, actions, sections, and steps match the page
@test "neovim-dashboard: models-inference runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/models-inference.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/models-inference.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS_OUT="$BATS_TEST_TMPDIR/models-inference-actions.txt"
  awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' "$RUNBOOK" > "$ACTIONS_OUT"
  EXPECTED_ACTIONS="$(printf 'models-status\nserver-config\nserver-logs\ngpu-resources\nserver-start\nserver-stop')"
  GOT_ACTIONS="$(cat "$ACTIONS_OUT")"
  if [ "$GOT_ACTIONS" != "$EXPECTED_ACTIONS" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done

  STEPS_OUT="$BATS_TEST_TMPDIR/models-inference-steps.txt"
  awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print line}' "$RUNBOOK" > "$STEPS_OUT"
  EXPECTED_STEPS="$(printf '%s\n' models-status server-config server-logs gpu-resources server-start server-stop)"
  GOT_STEPS="$(cat "$STEPS_OUT")"
  if [ "$GOT_STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
}

# ── T900661 repo-knowledge chapter (anchor: repo-knowledge) ──
@test "neovim-dashboard: repo-knowledge module exposes nine functions plus quickfix helper" {
  cat > "$PROBE_DIR/repo-knowledge-shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. package.path
local ok, m = pcall(require, 'config.repo-knowledge')
if not ok then
  io.stderr:write('LOAD FAILED config.repo-knowledge:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
local want = {
  'task_discover', 'k3_status', 'k3_symbol', 'k3_trace', 'project_docs',
  'runbook_open', 'check_freshness', 'check_manifests', 'code_maps',
  'send_to_quickfix',
}
for _, fn in ipairs(want) do
  if type(m[fn]) ~= 'function' then
    io.stderr:write('missing ' .. fn .. '\n')
    os.exit(1)
  end
end
print('all nine functions plus quickfix helper exist')
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/repo-knowledge-shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all nine functions plus quickfix helper exist"* ]]
}

@test "neovim-dashboard: repo-knowledge page lists nine actions in order" {
  cat > "$PROBE_DIR/repo-knowledge-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('repo-knowledge')
local names = {}
for _, r in ipairs(rows[3]) do
  if r.name then
    names[#names + 1] = r.name
  end
end
local f = io.open(outfile, 'w')
for _, n in ipairs(names) do
  f:write(n .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/repo-knowledge-order.out"
  run nvim -l "$PROBE_DIR/repo-knowledge-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  EXPECTED="$(printf 'task-discover\nk3-status\nk3-symbol\nk3-trace\nproject-docs\nrunbook-open\ncheck-freshness\ncheck-manifests\ncode-maps\n')"
  run diff - <<< "$EXPECTED" "$OUT"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: repo-knowledge page names no openspec action" {
  cat > "$PROBE_DIR/repo-knowledge-names.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. package.path
local dashboard = require('config.dashboard')
local rows = dashboard.sections('repo-knowledge')
local f = io.open(outfile, 'w')
for _, r in ipairs(rows[3]) do
  if r.name then
    f:write(r.name .. '\n')
  end
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/repo-knowledge-names.out"
  run nvim -l "$PROBE_DIR/repo-knowledge-names.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  [ -s "$OUT" ] || fail "no repo-knowledge action names dumped"
  run bash -c "grep -qi openspec '$OUT'"
  [ "$status" -ne 0 ]
}

@test "neovim-dashboard: repo-knowledge focus writes no marker, explicit execute does" {
  cat > "$PROBE_DIR/repo-knowledge-focus.lua" <<'LUA'
local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. package.path
vim.notify = function(msg)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end
_G.Snacks = {
  dashboard = function(opts) return { win = nil, opts = opts } end,
}
local dashboard = require('config.dashboard')
dashboard.show('repo-knowledge')
local mf1 = io.open(marker_file, 'r')
local phase1_marker_exists = mf1 ~= nil
if mf1 then mf1:close() end
local rows = dashboard.sections('repo-knowledge')
local target = nil
for _, r in ipairs(rows[3]) do
  if r.name == 'check-freshness' then target = r end
end
vim.cmd.edit(vim.fn.fnameescape(repo_file))
if target then target.action() end
local mf2 = io.open(marker_file, 'r')
local phase2_marker_exists = mf2 ~= nil
if mf2 then mf2:close() end
local out = io.open(out_file, 'w')
out:write('phase1_marker_exists=' .. tostring(phase1_marker_exists) .. '\n')
out:write('phase2_marker_exists=' .. tostring(phase2_marker_exists) .. '\n')
out:close()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/repo-knowledge-focus-marker.txt"
  OUT="$BATS_TEST_TMPDIR/repo-knowledge-focus-out.txt"
  nvim -l "$PROBE_DIR/repo-knowledge-focus.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  run grep '^phase1_marker_exists=' "$OUT"
  [[ "$output" == *"phase1_marker_exists=false"* ]]
  run grep '^phase2_marker_exists=' "$OUT"
  [[ "$output" == *"phase2_marker_exists=true"* ]]
  [ -s "$MARKER" ]
}

@test "neovim-dashboard: repo-knowledge k3-status names the index state" {
  command -v codebase-memory-mcp >/dev/null 2>&1 || skip "codebase-memory-mcp fehlt"
  cat > "$PROBE_DIR/repo-knowledge-k3status.lua" <<'LUA'
local stage, marker_file, repo_file = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. package.path
vim.notify = function(msg)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end
local ok, m = pcall(require, 'config.repo-knowledge')
if not ok then
  io.stderr:write('LOAD FAILED config.repo-knowledge:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
vim.cmd.edit(vim.fn.fnameescape(repo_file))
m.k3_status()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/repo-knowledge-k3status-marker.txt"
  run nvim -l "$PROBE_DIR/repo-knowledge-k3status.lua" "$STAGE" "$MARKER" "$REPO/CLAUDE.md"
  [ "$status" -eq 0 ]
  [ -s "$MARKER" ] || fail "k3-status produced no output"
  run grep -Eqi "ready|no K3 index covers|unavailable" "$MARKER"
  [ "$status" -eq 0 ]
}

@test "neovim-dashboard: repo-knowledge k3-symbol nonsense term reports zero hits, quickfix untouched" {
  command -v codebase-memory-mcp >/dev/null 2>&1 || skip "codebase-memory-mcp fehlt"
  cat > "$PROBE_DIR/repo-knowledge-k3symbol.lua" <<'LUA'
local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. package.path
vim.notify = function(msg)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end
vim.ui.input = function(_, cb) cb('xkcd-9371-qwerty') end
local ok, m = pcall(require, 'config.repo-knowledge')
if not ok then
  io.stderr:write('LOAD FAILED config.repo-knowledge:\n' .. tostring(m) .. '\n')
  os.exit(1)
end
vim.cmd.edit(vim.fn.fnameescape(repo_file))
m.k3_symbol()
local qf = vim.fn.getqflist()
local out = io.open(out_file, 'w')
out:write('qflen=' .. #qf .. '\n')
out:close()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/repo-knowledge-k3symbol-marker.txt"
  OUT="$BATS_TEST_TMPDIR/repo-knowledge-k3symbol-out.txt"
  run nvim -l "$PROBE_DIR/repo-knowledge-k3symbol.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/CLAUDE.md"
  [ "$status" -eq 0 ]
  run grep -q 'zero hits' "$MARKER"
  [ "$status" -eq 0 ]
  run grep '^qflen=' "$OUT"
  [[ "$output" == *"qflen=0"* ]]
}

@test "neovim-dashboard: repo-knowledge runbook exists and matches dashboard order" {
  RUNBOOK="$STAGE/runbooks/repo-knowledge.md"
  [ -f "$RUNBOOK" ] || fail "runbooks/repo-knowledge.md missing"
  run grep -q '^status: complete' "$RUNBOOK"
  [ "$status" -eq 0 ]
  ACTIONS="$(awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next}' "$RUNBOOK")"
  EXPECTED="$(printf 'task-discover\nk3-status\nk3-symbol\nk3-trace\nproject-docs\nrunbook-open\ncheck-freshness\ncheck-manifests\ncode-maps')"
  if [ "$ACTIONS" != "$EXPECTED" ]; then
    fail "runbook actions mismatch"
  fi
  for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
    run grep -q "^## $section" "$RUNBOOK"
    [ "$status" -eq 0 ]
  done

  STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
  EXPECTED_STEPS="$(printf '%s\n' task-discover k3-status k3-symbol k3-trace project-docs runbook-open check-freshness check-manifests code-maps)"
  if [ "$STEPS" != "$EXPECTED_STEPS" ]; then
    fail "runbook step order mismatch"
  fi
}

# ── T900747 editor wiring — registry probe (init.lua must import plugins.editor) ──
write_editor_wiring_probe() {
  cat > "$PROBE_DIR/editor-wiring.lua" <<'LUA'
local out_file = os.getenv('EDITOR_WIRING_OUT')
local out = io.open(out_file, 'w')
local ok, config = pcall(require, 'lazy.core.config')
if not ok or not config or not config.plugins then
  out:write('REGISTRY_MISSING\n')
  out:close()
  os.exit(1)
end
local names = {}
for name, _ in pairs(config.plugins) do
  names[#names + 1] = name
end
table.sort(names)
for _, name in ipairs(names) do
  out:write('plugin=' .. name .. '\n')
end
local au = vim.api.nvim_get_autocmds({ event = 'BufWritePre' })
out:write('bufwritepre_count=' .. #au .. '\n')
out:close()
LUA
}

@test "neovim-dashboard: T900747 editor wiring registers treesitter, lspconfig and blink" {
  if ! timeout 5 git ls-remote https://github.com/folke/lazy.nvim.git HEAD >/dev/null 2>&1; then
    skip "plugin host (github.com) unreachable — cannot bootstrap lazy.nvim offline"
  fi
  [ -f "$STAGE/init.lua" ] || fail "staged init.lua missing"
  write_editor_wiring_probe

  # Priming run: bootstraps lazy.nvim + all plugins. Its own log is a
  # separate file and is never the asserted run below (F6).
  nvim --headless -u "$STAGE/init.lua" -i NONE +"Lazy! sync" +qa \
    >"$BATS_TEST_TMPDIR/sync-wiring.out" 2>"$BATS_TEST_TMPDIR/sync-wiring.log" || true

  # The actual asserted run: headless startup with a file buffer, dumping
  # the sorted lazy registry plus the BufWritePre autocmd count.
  SCRATCH="$BATS_TEST_TMPDIR/wiring-buffer.txt"
  echo "wiring probe buffer" > "$SCRATCH"
  export EDITOR_WIRING_OUT="$BATS_TEST_TMPDIR/editor-wiring.out"
  LOG="$BATS_TEST_TMPDIR/startup-wiring.log"
  nvim --headless -u "$STAGE/init.lua" -i NONE "$SCRATCH" \
    +"luafile $PROBE_DIR/editor-wiring.lua" +qa >/dev/null 2>"$LOG"
  STARTUP_STATUS=$?
  [ "$STARTUP_STATUS" -eq 0 ]
  [ -s "$EDITOR_WIRING_OUT" ] || fail "wiring probe produced no output"
  grep -qx 'plugin=nvim-treesitter' "$EDITOR_WIRING_OUT" || fail "plugin=nvim-treesitter missing from lazy registry"
  grep -qx 'plugin=nvim-lspconfig' "$EDITOR_WIRING_OUT" || fail "plugin=nvim-lspconfig missing from lazy registry"
  grep -qx 'plugin=blink.cmp' "$EDITOR_WIRING_OUT" || fail "plugin=blink.cmp missing from lazy registry"
  grep -qx 'bufwritepre_count=0' "$EDITOR_WIRING_OUT" || fail "BufWritePre autocmds present after wiring startup"
  run bash -c "grep -qi error '$LOG'"
  [ "$status" -ne 0 ]
}
