"""Native migration of tests/spec/neovim-dashboard.bats."""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

# neovim-dashboard — Neuaufbau T901043 (nur Neovim).
# Pruefmodus: Output-Verifikation (Ergebnisdateien aus headless Proben);
# kein Source-Grep auf Implementierung (Ausnahme: explizite Negativ-
# Guards wie "kein Merge" / "kein stage-plan" im Modultext).
# Module: core.* (Kern) und chapters.* (Kapitel); Runbook-Vertrag:
# actions[] == Dashboard-Reihenfolge, Geordnete Schritte in gleicher Folge.

LOAD_PROBE = r"""local stage = arg[1]
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
"""

HOME_PROBE = r"""local stage, outfile = arg[1], arg[2]
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
"""

HOME_EXPECTED = (
    "Editor\n"
    "Files & Search\n"
    "JavaScript / Frontend\n"
    "GitHub\n"
    "SDLC\n"
    "Repository & Code Knowledge\n"
    "AI & Agents\n"
    "Models & Inference\n"
    "ComfyUI & Images\n"
    "ML & Training\n"
    "Infrastructure\n"
    "MCP Servers\n"
    "User Services\n"
    "Tests & Plans\n"
    "Settings & Help\n"
)

ALL_PAGES_PROBE = r"""local stage, outfile = arg[1], arg[2]
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
"""

GITROOT_PROBE = r"""local stage, target, outfile = arg[1], arg[2], arg[3]
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
"""

SHAPE_PROBE = r"""local stage = arg[1]
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
"""

FOCUS_PROBE = r"""local stage, marker_file, out_file, repo_file = arg[1], arg[2], arg[3], arg[4]
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
"""

STARTUP_PROBE = r"""local stage, outfile = arg[1], arg[2]
vim.opt.rtp:prepend(stage)
vim.env.NVIM_DASHBOARD_OFFLINE = '1'
dofile(stage .. '/init.lua')
local out = io.open(outfile, 'w')
out:write('exists=' .. vim.fn.exists(':Dashboard') .. '\n')
out:write('mapped=' .. tostring(vim.fn.maparg('<leader>h', 'n') ~= '') .. '\n')
out:write('pages=' .. #require('core.dashboard').pages() .. '\n')
out:close()
"""

NOFORMAT_PROBE = r"""local stage = arg[1]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
local ok, m = pcall(require, 'chapters.editor')
if not ok then os.exit(1) end
local setup_ok = pcall(m.setup)
print('setup_ok=' .. tostring(setup_ok))
print('bufwritepre_count=' .. #vim.api.nvim_get_autocmds({ event = 'BufWritePre' }))
os.exit(0)
"""

FS_ORDER_PROBE = r"""local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.files-search'))
local dashboard = require('core.dashboard')
local f = io.open(outfile, 'w')
for _, row in ipairs(dashboard.action_rows('files-search')) do
  f:write(row.name .. '\n')
end
f:close()
os.exit(0)
"""

JS_COMP_PROBE = r"""local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.js-frontend'))
local f = io.open(outfile, 'w')
for _, c in ipairs(require('chapters.js-frontend').components()) do
  f:write(c .. '\n')
end
f:close()
os.exit(0)
"""

AGENTS_PROBE = r"""local stage, outfile = arg[1], arg[2]
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
"""

MCP_PROBE = r"""local stage, outfile = arg[1], arg[2]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.mcp-servers'))
local f = io.open(outfile, 'w')
for _, s in ipairs(require('chapters.mcp-servers').servers()) do
  f:write(s .. '\n')
end
f:close()
os.exit(0)
"""

TP_PROBE = r"""local stage, root, outfile = arg[1], arg[2], arg[3]
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
"""

# The home/all-pages/shape/etc. probes above use these chapter lists; the
# inline list order matches the BATS sources exactly.


def _fail(msg: str):
    raise AssertionError(msg)


def _awk_actions(text: str) -> list:
    """awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}'"""
    out = []
    f = False
    for line in text.splitlines():
        if not f:
            if re.match(r"^actions:", line):
                f = True
            continue
        if line.startswith("  - "):
            out.append(line[4:])
            continue
        break
    return out


def _awk_steps(text: str) -> str:
    """awk over '## Geordnete Schritte' numbered bold steps, lowercased, joined by newline."""
    out = []
    f = False
    for line in text.splitlines():
        if line.startswith("## Geordnete Schritte"):
            f = True
            continue
        if f and line.startswith("## "):
            break
        if f and re.match(r"^[0-9]+\. \*\*", line):
            value = re.sub(r"^[0-9]+\. \*\*", "", line, count=1)
            value = re.sub(r"\*\*.*", "", value, count=1)
            out.append(value.lower())
    return "\n".join(out)


class _Nvim:
    """setup() of neovim-dashboard.bats: isolated XDG tree with the staged config."""

    def __init__(self, run_cmd, repo_root: Path, tmp_path: Path):
        self.run_cmd = run_cmd
        self.repo = repo_root
        self.tmp = tmp_path
        self.xdg_config = tmp_path / "xdg-config"
        self.xdg_data = tmp_path / "xdg-data"
        self.xdg_state = tmp_path / "xdg-state"
        for d in (self.xdg_config, self.xdg_data, self.xdg_state):
            d.mkdir(parents=True, exist_ok=True)
        self.env = {
            "XDG_CONFIG_HOME": str(self.xdg_config),
            "XDG_DATA_HOME": str(self.xdg_data),
            "XDG_STATE_HOME": str(self.xdg_state),
        }
        config_src = Path(os.environ.get("NVIM_DASHBOARD_CONFIG_SRC",
                                         str(repo_root / "dotfiles/nvim")))
        self.stage = self.xdg_config / "nvim"
        self.stage.mkdir(parents=True, exist_ok=True)
        if config_src.is_dir():
            shutil.copytree(config_src, self.stage, dirs_exist_ok=True)
        self.probes = tmp_path / "probes"
        self.probes.mkdir(parents=True, exist_ok=True)

    def probe(self, name: str, source: str) -> Path:
        path = self.probes / name
        path.write_text(source)
        return path

    def nvim_l(self, script: Path, *args, env=None, cwd=None):
        return self.run_cmd(["nvim", "-l", str(script), *args],
                            env={**self.env, **(env or {})}, cwd=cwd)

    def nvim_headless(self, *cmd_parts):
        """nvim --headless -u NONE -c "set rtp+=STAGE" -c ... -c "qa!" 2>&1"""
        args = ["nvim", "--headless", "-u", "NONE", "-c", f"set rtp+={self.stage}"]
        for part in cmd_parts:
            args += ["-c", part]
        args += ["-c", "qa!"]
        return self.run_cmd(args, env=self.env)


def _out(path: Path) -> str:
    return path.read_text() if path.exists() else ""


@pytest.fixture
def nv(run_cmd, repo_root, tmp_path):
    if shutil.which("nvim") is None:
        pytest.skip("nvim fehlt")
    return _Nvim(run_cmd, repo_root, tmp_path)


def _write_load_probe(nv):
    return nv.probe("load.lua", LOAD_PROBE)


# ── Helper: module-load probe (all core + chapter modules) ──────────────

def test_neovim_dashboard_staged_core_and_chapter_modules_load_headless_without_network(nv):
    script = _write_load_probe(nv)
    result = nv.nvim_l(script, str(nv.stage))
    assert result.returncode == 0
    assert "all modules loaded" in result.output


def test_neovim_dashboard_red_run_against_an_empty_config_source_fails_as_expected(nv):
    script = _write_load_probe(nv)
    # Isolated XDG tree: nvim -l also resolves stdpath('config')/lua, so the
    # RED run must not see the staged config at all.
    empty = {
        "XDG_CONFIG_HOME": str(nv.tmp / "xdg-empty-config"),
        "XDG_DATA_HOME": str(nv.tmp / "xdg-empty-data"),
        "XDG_STATE_HOME": str(nv.tmp / "xdg-empty-state"),
    }
    result = nv.nvim_l(script, str(nv.tmp / "does-not-exist"), env=empty)
    assert result.returncode != 0


# ── Helper: Home titles probe ───────────────────────────────────────────

def test_neovim_dashboard_home_lists_exactly_the_fifteen_chapters_in_order(nv):
    script = nv.probe("home.lua", HOME_PROBE)
    out = nv.tmp / "home-order.out"
    result = nv.nvim_l(script, str(nv.stage), str(out))
    assert result.returncode == 0
    assert _out(out) == HOME_EXPECTED
    assert "factory" not in result.output.lower()


def test_neovim_dashboard_runbook_master_index_matches_the_dashboard_home_order(nv):
    index_md = nv.stage / "runbooks/index.md"
    if not index_md.is_file():
        _fail("staged runbooks/index.md missing")
    script = nv.probe("home.lua", HOME_PROBE)
    home_out = nv.tmp / "home-order2.out"
    result = nv.nvim_l(script, str(nv.stage), str(home_out))
    assert result.returncode == 0

    names = []
    for line in index_md.read_text().splitlines():
        if not line.startswith("| "):
            continue
        parts = line.split("|")
        col2 = parts[1] if len(parts) > 1 else ""
        if "Seite" in col2 or "---" in col2:
            continue
        names.append(col2.strip(" "))
    index_names = "".join(f"{n}\n" for n in names)
    assert _out(home_out) == index_names
    assert index_names.count("\n") == 15


def test_neovim_dashboard_home_md_actions_match_the_dashboard_home_titles_in_order(nv):
    home_md = nv.stage / "runbooks/home.md"
    if not home_md.is_file():
        _fail("staged runbooks/home.md missing")
    script = nv.probe("home.lua", HOME_PROBE)
    home_out = nv.tmp / "home-order3.out"
    result = nv.nvim_l(script, str(nv.stage), str(home_out))
    assert result.returncode == 0

    actions = _awk_actions(home_md.read_text())
    actions_text = "".join(f"{a}\n" for a in actions)
    assert _out(home_out) == actions_text
    assert re.search(r"^status: complete", home_md.read_text(), re.M)


# ── Every page: runbook coverage (F5, new structure) ─────────────────────

def test_neovim_dashboard_every_dashboard_page_has_a_complete_runbook_with_matching_actions(nv):
    script = nv.probe("all-pages.lua", ALL_PAGES_PROBE)
    all_out = nv.tmp / "all-pages.out"
    result = nv.nvim_l(script, str(nv.stage), str(all_out))
    assert result.returncode == 0
    assert all_out.exists() and all_out.stat().st_size > 0, "no pages dumped"

    missing = ""
    for line in all_out.read_text().splitlines(keepends=True):
        raw = line.rstrip("\n")
        page_id, _, actions_joined = raw.partition("\t")
        if not page_id:
            continue
        runbook = nv.stage / "runbooks" / f"{page_id}.md"
        if not runbook.is_file():
            missing += f"{page_id} (no runbook file); "
            continue
        if not re.search(r"^status: complete", runbook.read_text(), re.M):
            missing += f"{page_id} (runbook not status: complete); "
            continue
        expected = "".join(f"{a}\n" for a in actions_joined.split("|")) if actions_joined else ""
        got = "".join(f"{a}\n" for a in _awk_actions(runbook.read_text()))
        if expected != got:
            missing += f"{page_id} (actions[] mismatch); "
            continue
        text = runbook.read_text()
        for section in ("Voraussetzungen", "Geordnete Schritte", "Erwartetes Ergebnis",
                        "Troubleshooting", "Recovery"):
            if not re.search(rf"^## {section}", text, re.M):
                missing += f"{page_id} (section {section} fehlt); "
                break
        steps = _awk_steps(text)
        page_lower = actions_joined.replace("|", "\n").lower().rstrip("\n")
        if steps != page_lower:
            missing += f"{page_id} (step order mismatch); "

    assert missing == "", f"pages without runbook coverage: {missing}"


# ── gitroot (core, buffer-based) ──────────────────────────────────────────

def test_neovim_dashboard_gitroot_resolves_a_nested_main_checkout_file_to_the_checkout_top_level(nv, repo_root):
    script = nv.probe("gitroot.lua", GITROOT_PROBE)
    expected = subprocess.run(["git", "-C", str(repo_root), "rev-parse", "--show-toplevel"],
                              capture_output=True, text=True, check=True).stdout.rstrip("\n")
    out = nv.tmp / "gitroot-main.out"
    result = nv.nvim_l(script, str(nv.stage), str(repo_root / "AGENTS.md"), str(out))
    assert result.returncode == 0
    assert _out(out).rstrip("\n") == expected


def test_neovim_dashboard_gitroot_resolves_a_linked_worktree_file_to_that_worktree_root(nv, repo_root, run_cmd):
    script = nv.probe("gitroot.lua", GITROOT_PROBE)
    worktree = nv.tmp / "linked-worktree"
    try:
        run_cmd(["git", "-C", str(repo_root), "worktree", "add", "--detach", "--no-checkout",
                 str(worktree), "HEAD"]).check()
        run_cmd(["git", "-C", str(worktree), "checkout", "HEAD", "--", "AGENTS.md"]).check()

        out = nv.tmp / "gitroot-worktree.out"
        result = nv.nvim_l(script, str(nv.stage), str(worktree / "AGENTS.md"), str(out))
        assert result.returncode == 0
        assert _out(out).rstrip("\n") == str(worktree)
    finally:
        run_cmd(["git", "-C", str(repo_root), "worktree", "remove", "--force", str(worktree)])


def test_neovim_dashboard_gitroot_reports_no_project_for_unnamed_and_outside_buffers(nv):
    script = nv.probe("gitroot.lua", GITROOT_PROBE)
    out = nv.tmp / "gitroot-unnamed.out"
    result = nv.nvim_l(script, str(nv.stage), "UNNAMED", str(out))
    assert result.returncode == 0
    assert _out(out).rstrip("\n") == "NIL"
    outside = nv.tmp / "outside" / "outside.txt"
    outside.parent.mkdir(parents=True, exist_ok=True)
    outside.touch()
    out2 = nv.tmp / "gitroot-outside.out"
    result = nv.nvim_l(script, str(nv.stage), str(outside), str(out2))
    assert result.returncode == 0
    assert _out(out2).rstrip("\n") == "NIL"


def test_neovim_dashboard_gitroot_resolves_a_nested_file_under_a_space_containing_scratch_repo(nv, run_cmd):
    script = nv.probe("gitroot.lua", GITROOT_PROBE)
    scratch = nv.tmp / "nv space" / "repo"
    (scratch / "nested").mkdir(parents=True)
    run_cmd(["git", "init", "-q", str(scratch)]).check()
    (scratch / "nested" / "file.txt").touch()
    out = nv.tmp / "gitroot-space.out"
    result = nv.nvim_l(script, str(nv.stage), str(scratch / "nested" / "file.txt"), str(out))
    assert result.returncode == 0
    assert _out(out).rstrip("\n") == str(scratch)


# ── Action model: shape + focus-before-execute ───────────────────────────

def test_neovim_dashboard_every_action_row_carries_the_full_six_field_shape(nv):
    script = nv.probe("shape.lua", SHAPE_PROBE)
    result = nv.nvim_l(script, str(nv.stage))
    assert result.returncode == 0
    assert "shape ok" in result.output


def test_neovim_dashboard_focusing_or_searching_never_executes_the_explicit_step_does(nv, repo_root):
    script = nv.probe("focus.lua", FOCUS_PROBE)
    marker = nv.tmp / "focus-marker.txt"
    out = nv.tmp / "focus-out.txt"
    result = nv.nvim_l(script, str(nv.stage), str(marker), str(out), str(repo_root / "AGENTS.md"))
    assert result.returncode == 0
    text = _out(out)
    assert "phase1_marker_exists=false" in [ln for ln in text.splitlines() if ln.startswith("phase1_marker_exists=")][0]
    assert "phase2_marker_exists=true" in [ln for ln in text.splitlines() if ln.startswith("phase2_marker_exists=")][0]


# ── init.lua: slim startup (leader, bootstrap offline-safe, 3 setup calls) ──

def test_neovim_dashboard_full_init_startup_registers_dashboard_and_leader_h_with_fifteen_pages(nv):
    script = nv.probe("startup.lua", STARTUP_PROBE)
    out = nv.tmp / "startup.out"
    result = nv.nvim_l(script, str(nv.stage), str(out))
    assert result.returncode == 0
    text = _out(out)
    assert "exists=2" in [ln for ln in text.splitlines() if ln.startswith("exists=")][0]
    assert "mapped=true" in [ln for ln in text.splitlines() if ln.startswith("mapped=")][0]
    assert "pages=15" in [ln for ln in text.splitlines() if ln.startswith("pages=")][0]
    init_lua = (nv.stage / "init.lua").read_text().splitlines()
    count = sum(1 for ln in init_lua if re.search(r"\.setup(_chapters)?\(\)", ln))
    assert count == 3


# ── p2: editor health (no "error" word), no format-on-save ───────────────

def test_neovim_dashboard_editor_checkhealth_reports_every_server_without_errors(nv):
    result = nv.nvim_headless("lua require('chapters.editor').checkhealth()")
    assert result.returncode == 0
    assert "picker: snacks.picker" in result.output
    assert "error" not in result.output.lower()


def test_neovim_dashboard_editor_setup_creates_zero_bufwritepre_autocmds(nv):
    script = nv.probe("noformat.lua", NOFORMAT_PROBE)
    result = nv.nvim_l(script, str(nv.stage))
    assert result.returncode == 0
    assert "setup_ok=true" in result.output
    assert "bufwritepre_count=0" in result.output


# ── p3: files-search five actions ────────────────────────────────────────

def test_neovim_dashboard_files_search_page_lists_exactly_the_five_actions(nv):
    script = nv.probe("fs-order.lua", FS_ORDER_PROBE)
    out = nv.tmp / "fs-order.out"
    result = nv.nvim_l(script, str(nv.stage), str(out))
    assert result.returncode == 0
    assert _out(out) == "find-file\nlive-grep\nbuffers\nrecent-files\nrelated-open\n"


# ── p4: js-frontend components ───────────────────────────────────────────

def test_neovim_dashboard_js_frontend_detects_website_plus_a_previously_uncovered_component(nv, repo_root):
    script = nv.probe("js-comp.lua", JS_COMP_PROBE)
    out = nv.tmp / "js-comp.out"
    result = nv.nvim_l(script, str(nv.stage), str(out), cwd=repo_root)
    assert result.returncode == 0
    lines = _out(out).splitlines()
    assert "components/website" in lines
    assert any(c in lines for c in ("components/VideoVault", "components/studio-server",
                                    "components/mentolder-web", "components/mediaviewer-widget")) \
        or any("packages/" in ln for ln in _out(out).splitlines()) or "packages/" in _out(out)


# ── p5: github five without merge, sdlc seven read-only ─────────────────

def test_neovim_dashboard_github_page_lists_five_actions_and_no_merge(nv):
    result = nv.nvim_headless(
        "lua print(#require('chapters.github').actions(), #require('chapters.sdlc').actions())")
    assert result.returncode == 0
    assert "5" in result.output
    assert "7" in result.output
    github = nv.stage / "lua/chapters/github.lua"
    assert github.is_file()
    assert "merge" not in github.read_text().lower()


def test_neovim_dashboard_sdlc_actions_are_read_only_no_mutations_from_the_editor(nv):
    sdlc = nv.stage / "lua/chapters/sdlc.lua"
    assert sdlc.is_file()
    assert not re.search(r"stage-plan|release-hold|update-status", sdlc.read_text())


# ── p6: knowledge graph actions, agents only-installed ──────────────────

def test_neovim_dashboard_knowledge_lists_graph_actions_agents_list_only_installed_clis(nv):
    script = nv.probe("agents.lua", AGENTS_PROBE)
    out = nv.tmp / "agents.out"
    result = nv.nvim_l(script, str(nv.stage), str(out))
    assert result.returncode == 0
    lines = _out(out).splitlines()
    knowledge = "\n".join(ln for ln in lines if ln.startswith("knowledge="))
    assert "symbol-search" in knowledge
    assert "semantic-search" in knowledge
    alls = "\n".join(ln for ln in lines if ln.startswith("all="))
    assert "opencode" in alls
    assert "agy" in alls
    assert "none=0" in "\n".join(ln for ln in lines if ln.startswith("none="))


# ── p7: models loadouts, comfyui four ────────────────────────────────────

def test_neovim_dashboard_models_reads_loadouts_from_json_both_chapters_expose_actions(nv, repo_root):
    loadouts = json.loads((repo_root / "scripts/llm/loadouts.json").read_text())
    assert len(loadouts["loadouts"]) > 0
    result = nv.nvim_headless(
        "lua print(#require('chapters.models-inference').actions(), "
        "#require('chapters.comfyui-images').actions())")
    assert result.returncode == 0
    assert "4" in result.output


# ── p8: infra/ml/mcp/settings/user-services ─────────────────────────────

def test_neovim_dashboard_infra_ml_mcp_settings_and_user_services_expose_actions(nv):
    result = nv.nvim_headless(
        "lua print(#require('chapters.infrastructure').actions(), "
        "#require('chapters.ml-training').actions(), "
        "#require('chapters.mcp-servers').actions(), "
        "#require('chapters.settings-help').actions(), "
        "#require('chapters.user-services').actions())")
    assert result.returncode == 0
    for needle in ("6", "4", "3", "5"):
        assert needle in result.output


def test_neovim_dashboard_mcp_servers_come_from_the_registry_no_hardcoded_sort_in_user_services(nv, repo_root):
    script = nv.probe("mcp.lua", MCP_PROBE)
    out = nv.tmp / "mcp.out"
    result = nv.nvim_l(script, str(nv.stage), str(out), cwd=repo_root)
    assert result.returncode == 0
    assert "ticket-mcp-node" in _out(out).splitlines()
    user_services = nv.stage / "lua/chapters/user-services.lua"
    assert user_services.is_file()
    assert "qwen" not in user_services.read_text()


# ── p9: tests & plans entries ───────────────────────────────────────────

def test_neovim_dashboard_tests_plans_page_lists_the_four_i4_entries(nv):
    result = nv.nvim_headless(
        "lua print(table.concat(require('chapters.tests-plans').actions(), ','))")
    assert result.returncode == 0
    assert "test-file,test-single,plan-browser,skill-browser" in result.output


def test_neovim_dashboard_test_file_maps_to_an_existing_test_plan_skill_browsers_list_fixtures(nv):
    script = nv.probe("tp.lua", TP_PROBE)
    fix = nv.tmp / "tp-fixture"
    (fix / ".agents/plans/demo").mkdir(parents=True)
    (fix / ".agents/skills/demo").mkdir(parents=True)
    (fix / "tests/spec").mkdir(parents=True)
    (fix / ".agents/plans/demo/tasks.md").touch()
    (fix / ".agents/skills/demo/SKILL.md").touch()
    (fix / "tests/spec/neovim-dashboard.bats").touch()
    out = nv.tmp / "tp.out"
    result = nv.nvim_l(script, str(nv.stage), str(fix), str(out))
    assert result.returncode == 0
    text = _out(out)
    assert "mapped=true" in text
    assert "unknown=true" in text
    assert "plans=1" in text
    assert "skills=1" in text
