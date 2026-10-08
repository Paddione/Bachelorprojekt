#!/usr/bin/env bats
# neovim-dashboard — Neuaufbau T901043 (nur Neovim).
# Pruefmodus: Output-Verifikation (Ergebnisdateien aus headless Proben);
# kein Source-Grep auf Implementierung (Ausnahme: explizite Negativ-
# Guards wie "kein Merge" / "kein stage-plan" im Modultext).
# Module: core.* (Kern) und chapters.* (Kapitel); Runbook-Vertrag:
# actions[] == Dashboard-Reihenfolge, Geordnete Schritte in gleicher Folge.

fail() {
  echo "$1" >&2
  return 1
}

setup() {
  command -v nvim >/dev/null 2>&1 || skip "nvim fehlt"

  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  # Reads the config source from an env var with a sane default so a RED
  # run can point this at an empty directory.
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

# ── Helper: module-load probe (all core + chapter modules) ──────────────
write_load_probe() {
  cat > "$PROBE_DIR/load.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
local mods = {
  'core.gitroot', 'core.actions', 'core.dashboard', 'core.options', 'core.keymaps', 'core.lazy',
  'chapters.editor', 'chapters.files-search', 'chapters.js-frontend', 'chapters.github',
  'chapters.sdlc', 'chapters.repo-knowledge', 'chapters.ai-agents', 'chapters.models-inference',
  'chapters.comfyui-images', 'chapters.ml-training', 'chapters.infrastructure',
  'chapters.mcp-servers', 'chapters.settings-help', 'chapters.user-services', 'chapters.tests-plans',
}
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

@test "neovim-dashboard: staged core and chapter modules load headless without network" {
  write_load_probe
  run nvim -l "$PROBE_DIR/load.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"all modules loaded"* ]]
}

@test "neovim-dashboard: RED run against an empty config source fails as expected" {
  write_load_probe
  # Isolated XDG tree: nvim -l also resolves stdpath('config')/lua, so the
  # RED run must not see the staged config at all.
  run env XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/xdg-empty-config" XDG_DATA_HOME="$BATS_TEST_TMPDIR/xdg-empty-data" XDG_STATE_HOME="$BATS_TEST_TMPDIR/xdg-empty-state" \
    nvim -l "$PROBE_DIR/load.lua" "$BATS_TEST_TMPDIR/does-not-exist"
  [ "$status" -ne 0 ]
}

# ── Helper: Home titles probe ───────────────────────────────────────────
write_home_probe() {
  cat > "$PROBE_DIR/home.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
for _, name in ipairs({
  'chapters.editor', 'chapters.files-search', 'chapters.js-frontend', 'chapters.github',
  'chapters.sdlc', 'chapters.repo-knowledge', 'chapters.ai-agents', 'chapters.models-inference',
  'chapters.comfyui-images', 'chapters.ml-training', 'chapters.infrastructure',
  'chapters.mcp-servers', 'chapters.user-services', 'chapters.tests-plans', 'chapters.settings-help',
}) do
  local ok, err = pcall(require, name)
  if not ok then
    io.stderr:write('LOAD FAILED ' .. name .. ': ' .. tostring(err) .. '\n')
    os.exit(1)
  end
end
local dashboard = require('core.dashboard')
local f = io.open(outfile, 'w')
for _, title in ipairs(dashboard.home_titles()) do
  f:write(title .. '\n')
end
f:close()
os.exit(0)
LUA
}

home_expected() {
  cat <<'EOF'
Editor
Files & Search
JavaScript / Frontend
GitHub
SDLC
Repository & Code Knowledge
AI & Agents
Models & Inference
ComfyUI & Images
ML & Training
Infrastructure
MCP Servers
User Services
Tests & Plans
Settings & Help
EOF
}

@test "neovim-dashboard: Home lists exactly the fifteen chapters in order" {
  write_home_probe
  OUT="$BATS_TEST_TMPDIR/home-order.out"
  run nvim -l "$PROBE_DIR/home.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  run diff <(home_expected) "$OUT"
  [ "$status" -eq 0 ]
  run bash -c "grep -qi factory '$OUT'"
  [ "$status" -ne 0 ]
}

@test "neovim-dashboard: runbook master index matches the dashboard Home order" {
  [ -f "$STAGE/runbooks/index.md" ] || fail "staged runbooks/index.md missing"
  write_home_probe
  HOME_OUT="$BATS_TEST_TMPDIR/home-order2.out"
  run nvim -l "$PROBE_DIR/home.lua" "$STAGE" "$HOME_OUT"
  [ "$status" -eq 0 ]

  INDEX_NAMES="$BATS_TEST_TMPDIR/index-names.txt"
  awk -F'|' '/^\| / && $2 !~ /Seite/ && $2 !~ /---/ {gsub(/^ +| +$/, "", $2); print $2}' \
    "$STAGE/runbooks/index.md" > "$INDEX_NAMES"
  run diff "$HOME_OUT" "$INDEX_NAMES"
  [ "$status" -eq 0 ]
  CHAPTER_COUNT="$(wc -l < "$INDEX_NAMES" | tr -d ' ')"
  [ "$CHAPTER_COUNT" -eq 15 ]
}

@test "neovim-dashboard: home.md actions match the dashboard Home titles in order" {
  [ -f "$STAGE/runbooks/home.md" ] || fail "staged runbooks/home.md missing"
  write_home_probe
  HOME_OUT="$BATS_TEST_TMPDIR/home-order3.out"
  run nvim -l "$PROBE_DIR/home.lua" "$STAGE" "$HOME_OUT"
  [ "$status" -eq 0 ]

  ACTIONS="$BATS_TEST_TMPDIR/home-actions.txt"
  awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' \
    "$STAGE/runbooks/home.md" > "$ACTIONS"
  run diff "$HOME_OUT" "$ACTIONS"
  [ "$status" -eq 0 ]
  run grep -q '^status: complete' "$STAGE/runbooks/home.md"
  [ "$status" -eq 0 ]
}

# ── Every page: runbook coverage (F5, new structure) ─────────────────────
@test "neovim-dashboard: every dashboard page has a complete runbook with matching actions" {
  cat > "$PROBE_DIR/all-pages.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
for _, name in ipairs({
  'chapters.editor', 'chapters.files-search', 'chapters.js-frontend', 'chapters.github',
  'chapters.sdlc', 'chapters.repo-knowledge', 'chapters.ai-agents', 'chapters.models-inference',
  'chapters.comfyui-images', 'chapters.ml-training', 'chapters.infrastructure',
  'chapters.mcp-servers', 'chapters.user-services', 'chapters.tests-plans', 'chapters.settings-help',
}) do
  assert(pcall(require, name))
end
local dashboard = require('core.dashboard')
local f = io.open(outfile, 'w')
for _, id in ipairs(dashboard.pages()) do
  local names = {}
  for _, row in ipairs(dashboard.action_rows(id)) do
    if row.name then
      names[#names + 1] = row.name
    end
  end
  f:write(id .. '\t' .. table.concat(names, '|') .. '\n')
end
f:close()
os.exit(0)
LUA
  ALL_OUT="$BATS_TEST_TMPDIR/all-pages.out"
  run nvim -l "$PROBE_DIR/all-pages.lua" "$STAGE" "$ALL_OUT"
  [ "$status" -eq 0 ]
  [ -s "$ALL_OUT" ] || fail "no pages dumped"

  MISSING=""
  while IFS=$'\t' read -r page_id actions_joined; do
    [ -n "$page_id" ] || continue
    RUNBOOK="$STAGE/runbooks/${page_id}.md"
    [ -f "$RUNBOOK" ] || { MISSING="${MISSING}${page_id} (no runbook file); "; continue; }
    run grep -q '^status: complete' "$RUNBOOK"
    [ "$status" -eq 0 ] || { MISSING="${MISSING}${page_id} (runbook not status: complete); "; continue; }
    EXPECTED="$BATS_TEST_TMPDIR/${page_id}-expected-actions.txt"
    if [ -n "$actions_joined" ]; then
      printf '%s\n' "$actions_joined" | tr '|' '\n' > "$EXPECTED"
    else
      : > "$EXPECTED"
    fi
    GOT="$BATS_TEST_TMPDIR/${page_id}-got-actions.txt"
    awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' \
      "$RUNBOOK" > "$GOT"
    run diff "$EXPECTED" "$GOT"
    [ "$status" -eq 0 ] || { MISSING="${MISSING}${page_id} (actions[] mismatch); "; continue; }
    for section in "Voraussetzungen" "Geordnete Schritte" "Erwartetes Ergebnis" "Troubleshooting" "Recovery"; do
      run grep -q "^## $section" "$RUNBOOK"
      [ "$status" -eq 0 ] || { MISSING="${MISSING}${page_id} (section $section fehlt); "; break; }
    done
    STEPS="$(awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print tolower(line)}' "$RUNBOOK")"
    PAGE_LOWER="$(tr '|' '\n' <<< "$actions_joined" | tr '[:upper:]' '[:lower:]')"
    if [ "$STEPS" != "$PAGE_LOWER" ]; then
      MISSING="${MISSING}${page_id} (step order mismatch); "
    fi
  done < "$ALL_OUT"

  [ -z "$MISSING" ] || fail "pages without runbook coverage: $MISSING"
}

# ── gitroot (core, buffer-based) ──────────────────────────────────────────
write_gitroot_probe() {
  cat > "$PROBE_DIR/gitroot.lua" <<'LUA'
local stage, target, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
local gitroot = require('core.gitroot')
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
  run nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$REPO/AGENTS.md" "$OUT"
  [ "$status" -eq 0 ]
  [ "$(cat "$OUT")" = "$EXPECTED" ]
}

@test "neovim-dashboard: gitroot resolves a linked-worktree file to that worktree root" {
  write_gitroot_probe
  WORKTREE="$BATS_TEST_TMPDIR/linked-worktree"
  run git -C "$REPO" worktree add --detach --no-checkout "$WORKTREE" HEAD
  [ "$status" -eq 0 ]
  run git -C "$WORKTREE" checkout HEAD -- AGENTS.md
  [ "$status" -eq 0 ]

  OUT="$BATS_TEST_TMPDIR/gitroot-worktree.out"
  run nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$WORKTREE/AGENTS.md" "$OUT"
  [ "$status" -eq 0 ]
  [ "$(cat "$OUT")" = "$WORKTREE" ]

  git -C "$REPO" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
}

@test "neovim-dashboard: gitroot reports no-project for unnamed and outside buffers" {
  write_gitroot_probe
  OUT="$BATS_TEST_TMPDIR/gitroot-unnamed.out"
  run nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "UNNAMED" "$OUT"
  [ "$status" -eq 0 ]
  [ "$(cat "$OUT")" = "NIL" ]
  OUTSIDE="$BATS_TEST_TMPDIR/outside/outside.txt"
  mkdir -p "$(dirname "$OUTSIDE")"
  touch "$OUTSIDE"
  OUT2="$BATS_TEST_TMPDIR/gitroot-outside.out"
  run nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$OUTSIDE" "$OUT2"
  [ "$status" -eq 0 ]
  [ "$(cat "$OUT2")" = "NIL" ]
}

@test "neovim-dashboard: gitroot resolves a nested file under a space-containing scratch repo" {
  write_gitroot_probe
  SCRATCH="$BATS_TEST_TMPDIR/nv space/repo"
  mkdir -p "$SCRATCH/nested"
  git init -q "$SCRATCH"
  touch "$SCRATCH/nested/file.txt"
  OUT="$BATS_TEST_TMPDIR/gitroot-space.out"
  run nvim -l "$PROBE_DIR/gitroot.lua" "$STAGE" "$SCRATCH/nested/file.txt" "$OUT"
  [ "$status" -eq 0 ]
  [ "$(cat "$OUT")" = "$SCRATCH" ]
}

# ── Action model: shape + focus-before-execute ───────────────────────────
@test "neovim-dashboard: every action row carries the full six-field shape" {
  cat > "$PROBE_DIR/shape.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
for _, name in ipairs({
  'chapters.editor', 'chapters.files-search', 'chapters.js-frontend', 'chapters.github',
  'chapters.sdlc', 'chapters.repo-knowledge', 'chapters.ai-agents', 'chapters.models-inference',
  'chapters.comfyui-images', 'chapters.ml-training', 'chapters.infrastructure',
  'chapters.mcp-servers', 'chapters.settings-help', 'chapters.user-services', 'chapters.tests-plans',
}) do
  assert(pcall(require, name))
end
local dashboard = require('core.dashboard')
local count = 0
for _, id in ipairs(dashboard.pages()) do
  for _, row in ipairs(dashboard.action_rows(id)) do
    for _, field in ipairs({ 'name', 'inputs', 'target', 'effect', 'cwd', 'on_error' }) do
      if row[field] == nil then
        io.stderr:write('SHAPE MISSING ' .. id .. '.' .. tostring(row.name) .. ' field ' .. field .. '\n')
        os.exit(1)
      end
    end
    if type(row.action) ~= 'function' then
      io.stderr:write('SHAPE MISSING action fn ' .. id .. '.' .. tostring(row.name) .. '\n')
      os.exit(1)
    end
    count = count + 1
  end
end
print('shape ok, actions=' .. count)
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/shape.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"shape ok"* ]]
}

@test "neovim-dashboard: focusing or searching never executes; the explicit step does" {
  cat > "$PROBE_DIR/focus.lua" <<'LUA'
local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
vim.notify = function(msg)
  local f = io.open(marker_file, 'a')
  f:write(tostring(msg) .. '\n')
  f:close()
end
for _, name in ipairs({
  'chapters.editor', 'chapters.files-search', 'chapters.infrastructure', 'chapters.settings-help',
}) do
  assert(pcall(require, name))
end
local dashboard = require('core.dashboard')
dashboard.show('infrastructure')
dashboard.show('home')
dashboard.search()
local mf1 = io.open(marker_file, 'r')
local phase1 = mf1 ~= nil
if mf1 then mf1:close() end
-- Explicit execute step with a stubbed confirm dialog.
vim.ui.select = function(items, opts, on_choice) on_choice('Ausfuehren') end
vim.cmd.edit(vim.fn.fnameescape(repo_file))
local actions = require('core.actions')
actions.run({ name = 'probe', effect = function() vim.notify('executed') end })
local mf2 = io.open(marker_file, 'r')
local phase2 = mf2 ~= nil
if mf2 then mf2:close() end
local out = io.open(out_file, 'w')
out:write('phase1_marker_exists=' .. tostring(phase1) .. '\n')
out:write('phase2_marker_exists=' .. tostring(phase2) .. '\n')
out:close()
os.exit(0)
LUA
  MARKER="$BATS_TEST_TMPDIR/focus-marker.txt"
  OUT="$BATS_TEST_TMPDIR/focus-out.txt"
  run nvim -l "$PROBE_DIR/focus.lua" "$STAGE" "$MARKER" "$OUT" "$REPO/AGENTS.md"
  [ "$status" -eq 0 ]
  run grep '^phase1_marker_exists=' "$OUT"
  [[ "$output" == *"phase1_marker_exists=false"* ]]
  run grep '^phase2_marker_exists=' "$OUT"
  [[ "$output" == *"phase2_marker_exists=true"* ]]
}

# ── init.lua: slim startup (leader, bootstrap offline-safe, 3 setup calls) ──
@test "neovim-dashboard: full init startup registers :Dashboard and <leader>h with fifteen pages" {
  cat > "$PROBE_DIR/startup.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
vim.opt.rtp:prepend(stage)
vim.env.NVIM_DASHBOARD_OFFLINE = '1'
dofile(stage .. '/init.lua')
local out = io.open(outfile, 'w')
out:write('exists=' .. vim.fn.exists(':Dashboard') .. '\n')
out:write('mapped=' .. tostring(vim.fn.maparg('<leader>h', 'n') ~= '') .. '\n')
out:write('pages=' .. #require('core.dashboard').pages() .. '\n')
out:close()
LUA
  OUT="$BATS_TEST_TMPDIR/startup.out"
  run nvim -l "$PROBE_DIR/startup.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  run grep '^exists=' "$OUT"
  [[ "$output" == *"exists=2"* ]]
  run grep '^mapped=' "$OUT"
  [[ "$output" == *"mapped=true"* ]]
  run grep '^pages=' "$OUT"
  [[ "$output" == *"pages=15"* ]]
  run grep -cE '\.setup(_chapters)?\(\)' "$STAGE/init.lua"
  [ "$output" -eq 3 ]
}

# ── p2: editor health (no "error" word), no format-on-save ───────────────
@test "neovim-dashboard: editor checkhealth reports every server without errors" {
  run nvim --headless -u NONE -c "set rtp+=$STAGE" \
    -c "lua require('chapters.editor').checkhealth()" -c "qa!" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"picker: snacks.picker"* ]]
  run bash -c "grep -qi error <<< '$output'"
  [ "$status" -ne 0 ]
}

@test "neovim-dashboard: editor setup creates zero BufWritePre autocmds" {
  cat > "$PROBE_DIR/noformat.lua" <<'LUA'
local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
local ok, m = pcall(require, 'chapters.editor')
if not ok then os.exit(1) end
local setup_ok = pcall(m.setup)
print('setup_ok=' .. tostring(setup_ok))
print('bufwritepre_count=' .. #vim.api.nvim_get_autocmds({ event = 'BufWritePre' }))
os.exit(0)
LUA
  run nvim -l "$PROBE_DIR/noformat.lua" "$STAGE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"setup_ok=true"* ]]
  [[ "$output" == *"bufwritepre_count=0"* ]]
}

# ── p3: files-search five actions ────────────────────────────────────────
@test "neovim-dashboard: files-search page lists exactly the five actions" {
  cat > "$PROBE_DIR/fs-order.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.files-search'))
local dashboard = require('core.dashboard')
local f = io.open(outfile, 'w')
for _, row in ipairs(dashboard.action_rows('files-search')) do
  f:write(row.name .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/fs-order.out"
  run nvim -l "$PROBE_DIR/fs-order.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  EXPECTED="$(printf 'find-file\nlive-grep\nbuffers\nrecent-files\nrelated-open\n')"
  run diff <(printf '%s\n' "$EXPECTED") "$OUT"
  [ "$status" -eq 0 ]
}

# ── p4: js-frontend components ───────────────────────────────────────────
@test "neovim-dashboard: js-frontend detects website plus a previously uncovered component" {
  cat > "$PROBE_DIR/js-comp.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.js-frontend'))
local f = io.open(outfile, 'w')
for _, c in ipairs(require('chapters.js-frontend').components()) do
  f:write(c .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/js-comp.out"
  run bash -c "cd '$REPO' && nvim -l '$PROBE_DIR/js-comp.lua' '$STAGE' '$OUT'"
  [ "$status" -eq 0 ]
  run grep -qx 'components/website' "$OUT"
  [ "$status" -eq 0 ]
  run bash -c "grep -qx 'components/VideoVault' '$OUT' || grep -qx 'components/studio-server' '$OUT' || grep -qx 'components/mentolder-web' '$OUT' || grep -qx 'components/mediaviewer-widget' '$OUT' || grep -q 'packages/' '$OUT'"
  [ "$status" -eq 0 ]
}

# ── p5: github five without merge, sdlc seven read-only ─────────────────
@test "neovim-dashboard: github page lists five actions and no merge" {
  run nvim --headless -u NONE -c "set rtp+=$STAGE" \
    -c "lua print(#require('chapters.github').actions(), #require('chapters.sdlc').actions())" -c "qa!" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"5"* ]] && [[ "$output" == *"7"* ]]
  run bash -c "grep -ri merge '$STAGE/lua/chapters/github.lua'"
  [ "$status" -eq 1 ]
}

@test "neovim-dashboard: sdlc actions are read-only (no mutations from the editor)" {
  run bash -c "grep -rE 'stage-plan|release-hold|update-status' '$STAGE/lua/chapters/sdlc.lua'"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

# ── p6: knowledge graph actions, agents only-installed ──────────────────
@test "neovim-dashboard: knowledge lists graph actions, agents list only installed CLIs" {
  cat > "$PROBE_DIR/agents.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.repo-knowledge'))
assert(pcall(require, 'chapters.ai-agents'))
local rk, aa = require('chapters.repo-knowledge'), require('chapters.ai-agents')
local f = io.open(outfile, 'w')
f:write('knowledge=' .. table.concat(rk.actions(), ',') .. '\n')
vim.fn.executable = function() return 1 end
f:write('all=' .. table.concat(aa.agents(), ',') .. '\n')
vim.fn.executable = function() return 0 end
f:write('none=' .. #aa.agents() .. '\n')
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/agents.out"
  run nvim -l "$PROBE_DIR/agents.lua" "$STAGE" "$OUT"
  [ "$status" -eq 0 ]
  run grep '^knowledge=' "$OUT"
  [[ "$output" == *"symbol-search"* ]] && [[ "$output" == *"semantic-search"* ]]
  run grep '^all=' "$OUT"
  [[ "$output" == *"opencode"* ]] && [[ "$output" == *"agy"* ]]
  run grep '^none=' "$OUT"
  [[ "$output" == *"none=0"* ]]
}

# ── p7: models loadouts, comfyui four ────────────────────────────────────
@test "neovim-dashboard: models reads loadouts from JSON, both chapters expose actions" {
  COUNT="$(python3 -c "import json; print(len(json.load(open('$REPO/scripts/llm/loadouts.json'))['loadouts']))")"
  [ "$COUNT" -gt 0 ]
  run nvim --headless -u NONE -c "set rtp+=$STAGE" \
    -c "lua print(#require('chapters.models-inference').actions(), #require('chapters.comfyui-images').actions())" -c "qa!" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"4"* ]]
}

# ── p8: infra/ml/mcp/settings/user-services ─────────────────────────────
@test "neovim-dashboard: infra, ml, mcp, settings and user-services expose actions" {
  run nvim --headless -u NONE -c "set rtp+=$STAGE" \
    -c "lua print(#require('chapters.infrastructure').actions(), #require('chapters.ml-training').actions(), #require('chapters.mcp-servers').actions(), #require('chapters.settings-help').actions(), #require('chapters.user-services').actions())" -c "qa!" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"6"* ]] && [[ "$output" == *"4"* ]] && [[ "$output" == *"3"* ]] && [[ "$output" == *"5"* ]]
}

@test "neovim-dashboard: mcp servers come from the registry, no hardcoded sort in user-services" {
  cat > "$PROBE_DIR/mcp.lua" <<'LUA'
local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.mcp-servers'))
local f = io.open(outfile, 'w')
for _, s in ipairs(require('chapters.mcp-servers').servers()) do
  f:write(s .. '\n')
end
f:close()
os.exit(0)
LUA
  OUT="$BATS_TEST_TMPDIR/mcp.out"
  run bash -c "cd '$REPO' && nvim -l '$PROBE_DIR/mcp.lua' '$STAGE' '$OUT'"
  [ "$status" -eq 0 ]
  run grep -qx 'ticket-mcp-node' "$OUT"
  [ "$status" -eq 0 ]
  run bash -c "grep -n 'qwen' '$STAGE/lua/chapters/user-services.lua'"
  [ "$status" -eq 1 ]
}

# ── p9: tests & plans entries ───────────────────────────────────────────
@test "neovim-dashboard: tests-plans page lists the four I4 entries" {
  run nvim --headless -u NONE -c "set rtp+=$STAGE" \
    -c "lua print(table.concat(require('chapters.tests-plans').actions(), ','))" -c "qa!" 2>&1
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-file,test-single,plan-browser,skill-browser"* ]]
}

@test "neovim-dashboard: test-file maps to an existing test, plan/skill browsers list fixtures" {
  cat > "$PROBE_DIR/tp.lua" <<'LUA'
local stage, root, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.tests-plans'))
local tp = require('chapters.tests-plans')
local f = io.open(outfile, 'w')
local mapped = tp.test_for(root .. '/tests/spec/neovim-dashboard.bats')
f:write('mapped=' .. tostring(mapped ~= nil) .. '\n')
f:write('unknown=' .. tostring(tp.test_for(root .. '/no-such-file.xyz') == nil) .. '\n')
local captured = {}
vim.ui.select = function(items, opts, on_choice) captured = items end
tp.plan_browser('/tmp', root)
f:write('plans=' .. #captured .. '\n')
captured = {}
tp.skill_browser('/tmp', root)
f:write('skills=' .. #captured .. '\n')
f:close()
os.exit(0)
LUA
  FIX="$BATS_TEST_TMPDIR/tp-fixture"
  mkdir -p "$FIX/.agents/plans/demo" "$FIX/.agents/skills/demo" "$FIX/tests/spec"
  touch "$FIX/.agents/plans/demo/tasks.md" "$FIX/.agents/skills/demo/SKILL.md" "$FIX/tests/spec/neovim-dashboard.bats"
  OUT="$BATS_TEST_TMPDIR/tp.out"
  run nvim -l "$PROBE_DIR/tp.lua" "$STAGE" "$FIX" "$OUT"
  [ "$status" -eq 0 ]
  run grep '^mapped=' "$OUT"
  [[ "$output" == *"mapped=true"* ]]
  run grep '^unknown=' "$OUT"
  [[ "$output" == *"unknown=true"* ]]
  run grep '^plans=' "$OUT"
  [[ "$output" == *"plans=1"* ]]
  run grep '^skills=' "$OUT"
  [[ "$output" == *"skills=1"* ]]
}
