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

  RESULT="$BATS_TEST_TMPDIR/startup.out"
  LOG="$BATS_TEST_TMPDIR/startup.log"
  nvim --headless -u "$STAGE/init.lua" -i NONE +"Lazy! sync" +qa >"$RESULT" 2>"$LOG" || true
  run nvim --headless -u "$STAGE/init.lua" -i NONE +qa
  [ "$status" -eq 0 ]
  run bash -c "grep -qi error '$LOG'"
  [ "$status" -ne 0 ]
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
  WORKTREE="/home/patrick/Bachelorprojekt/.worktrees/nvim-dashboard-foundation"
  if [ ! -d "$WORKTREE" ]; then
    skip "linked worktree $WORKTREE not present on this host"
  fi
  OUT="$BATS_TEST_TMPDIR/gitroot-worktree.out"
  nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$WORKTREE/dotfiles/nvim/init.lua" "$OUT"
  [ "$(cat "$OUT")" = "$WORKTREE" ]
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
    if [ "$base" != "README.md" ] && [ "$base" != "_template.md" ] && [ "$base" != "home.md" ]; then
      fail "unexpected chapter runbook file already present: $base"
    fi
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
