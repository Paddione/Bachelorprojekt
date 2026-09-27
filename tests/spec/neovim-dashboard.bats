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

@test "neovim-dashboard: runbook master index matches the dashboard Home order, all chapters stub-marked" {
  [ -f "$STAGE/runbooks/README.md" ] || fail "staged runbooks/README.md missing"
  write_home_probe
  HOME_OUT="$BATS_TEST_TMPDIR/home-order2.out"
  nvim -l "$PROBE_DIR/home.lua" "$STAGE" "$HOME_OUT"

  # (a) Extract the ten chapter names from the index's numbered list and
  # diff against the dashboard Home order.
  INDEX_NAMES="$BATS_TEST_TMPDIR/index-names.txt"
  grep -E '^[0-9]+\. \*\*.+\*\* — T[0-9]+ — status: stub' "$STAGE/runbooks/README.md" \
    | sed -E 's/^[0-9]+\. \*\*(.+)\*\* — T[0-9]+ — status: stub.*/\1/' > "$INDEX_NAMES"
  run diff "$HOME_OUT" "$INDEX_NAMES"
  [ "$status" -eq 0 ]
  run bash -c "grep -qi factory '$INDEX_NAMES'"
  [ "$status" -ne 0 ]

  # (c) Every chapter entry is stub-marked with an owning ticket; the
  # count must be exactly ten, and no per-chapter file exists yet.
  STUB_COUNT="$(grep -cE 'status: stub' "$STAGE/runbooks/README.md")"
  [ "$STUB_COUNT" -eq 10 ]
  for f in "$STAGE"/runbooks/*.md; do
    base="$(basename "$f")"
    case "$base" in
      README.md|_template.md|home.md|infrastructure-status.md) ;;
      *) fail "unexpected chapter runbook file already present: $base" ;;
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
