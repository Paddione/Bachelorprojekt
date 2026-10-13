"""Neovim dashboard page coverage + live smoke (T901043).

Aus test_neovim_dashboard.py ausgegliedert (T016574, S1-Zeilenbudget):
Tests/Plans-Seite, Models-Filter, ComfyUI, Infra-Nodes, BATS-Runner,
Skill-Dirs, ML-Zonen, MCP-Probes, Settings-Recovery und die vier
Live-Tests. _Nvim-Harness, nv-Fixture und TP_PROBE sind mitgewandert;
Module-Load, Home, Runbooks und Kapitel-Tests bleiben in
test_neovim_dashboard.py.
"""

import json
import os
import re
import shutil
from pathlib import Path

import pytest

TP_PROBE = r"""local stage, root, outfile = arg[1], arg[2], arg[3]
package.path = stage .. '/lua/?.lua;' .. stage .. '/lua/?/init.lua;' .. package.path
assert(pcall(require, 'chapters.tests-plans'))
local tp = require('chapters.tests-plans')
local f = io.open(outfile, 'w')
local mapped = tp.test_for(root .. '/neovim-dashboard.lua')
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
        (self.xdg_data / "nvim").mkdir(parents=True, exist_ok=True)
        shared_lazy = Path.home() / ".local/share/nvim/lazy"
        if shared_lazy.is_dir() and not (self.xdg_data / "nvim/lazy").exists():
            try:
                os.symlink(shared_lazy, self.xdg_data / "nvim/lazy")
            except OSError:
                pass
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

    def nvim_live(self, *cmd_parts, cwd=None, env=None):
        """nvim --headless -u STAGE/init.lua -c ... -c "qa!" 2>&1 with full real config."""
        init_file = self.stage / "init.lua"
        args = ["nvim", "--headless", "-u", str(init_file)]
        for part in cmd_parts:
            args += ["-c", part]
        args += ["-c", "qa!"]
        return self.run_cmd(args, env={**self.env, **(env or {})}, cwd=cwd)



def _out(path: Path) -> str:
    return path.read_text() if path.exists() else ""



@pytest.fixture
def nv(run_cmd, repo_root, tmp_path):
    if shutil.which("nvim") is None:
        pytest.skip("nvim fehlt")
    return _Nvim(run_cmd, repo_root, tmp_path)


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
    (fix / ".agents/plans/demo/tasks.md").touch()
    (fix / ".agents/skills/demo/SKILL.md").touch()
    # [T901392] test_for findet das pytest-Modul tests/py/**/test_neovim_dashboard*.py im Repo.
    out = nv.tmp / "tp.out"
    result = nv.nvim_l(script, str(nv.stage), str(fix), str(out))
    assert result.returncode == 0
    text = _out(out)
    assert "mapped=true" in text
    assert "unknown=true" in text
    assert "plans=1" in text
    assert "skills=1" in text


# ── p8 batch-2 (T901793): enabled_filter, port_chain, nodes_lazygit ───
# ── bats_runner, skill_dirs, ml_zones, mcp_probes, recovery_pattern ───

def test_neovim_dashboard_models_enabled_filter_lists_only_enabled_loadouts(nv, repo_root):
    all_loadouts = json.loads((repo_root / "scripts/llm/loadouts.json").read_text())["loadouts"]
    want = sorted(l["slug"] for l in all_loadouts if l.get("enabled") is True)
    assert 0 < len(want) < len(all_loadouts)
    result = nv.nvim_headless(
        "lua local s={} for _,l in ipairs(require('chapters.models-inference').loadouts()) do s[#s+1]=l.slug end print('slugs='..table.concat(s,','))")
    assert result.returncode == 0
    got = [ln.split("=", 1)[1] for ln in result.output.splitlines() if ln.startswith("slugs=")][0]
    assert sorted(got.split(",")) == want


def test_neovim_dashboard_comfyui_port_chain_names_service_or_environments_source(nv, repo_root, monkeypatch):
    monkeypatch.setenv("COMFYUI_PORT", "")
    host = re.search(r'COMFY_HOST_IP:\s*"([^"]+)"', (repo_root / "environments/mentolder.yaml").read_text()).group(1)
    result = nv.nvim_headless(
        "lua local m=require('chapters.comfyui-images') local p,s=m.port_source() print('port='..p..' src='..s..' host='..tostring(m.remote_host()))")
    assert result.returncode == 0
    assert "port=8189" in result.output
    assert "service" in result.output or "environments" in result.output
    assert f"host={host}" in result.output


def test_neovim_dashboard_infra_nodes_lazygit_lists_nine_actions_in_order(nv):
    result = nv.nvim_headless(
        "lua print('infra='..table.concat(require('chapters.infrastructure').actions(),','))")
    assert result.returncode == 0
    assert "infra=cluster-status,nodes,pods,services,pod-logs,lazygit,kubectl-split,context-select,setup-checklist" in result.output


def test_neovim_dashboard_tests_bats_runner_recognizes_bats_files(nv):
    result = nv.nvim_headless(
        "lua local r=require('chapters.tests-plans').runner_for('x.bats') print('type='..r.type..' cmd='..r.cmd()[1])")
    assert result.returncode == 0
    assert "type=bats cmd=bats" in result.output


def test_neovim_dashboard_tests_skill_dirs_browser_lists_all_three_origins(nv):
    fix = nv.tmp / "skill-dirs"
    for d in (".agents/skills", ".claude/skills", ".opencode/skills"):
        (fix / d / "demo").mkdir(parents=True)
        (fix / d / "demo/SKILL.md").touch()
    result = nv.nvim_headless(
        f"lua local c={{}} vim.ui.select=function(i) c=i end require('chapters.tests-plans').skill_browser('/tmp','{fix}') print('skills='..table.concat(c,','))")
    assert result.returncode == 0
    assert "skills=.agents/skills: demo,.claude/skills: demo,.opencode/skills: demo" in result.output


def test_neovim_dashboard_ml_zones_lists_repo_and_box_zones(nv, repo_root):
    want = [z for z in ("ml", ".agents/training", "scripts/finetune") if (repo_root / z).is_dir()]
    if (Path.home() / "unsloth-boxes").is_dir():
        want.append("~/unsloth-boxes")
    assert len(want) >= 3
    result = nv.nvim_headless(
        "lua print('zones='..table.concat(require('chapters.ml-training').zones(),','))")
    assert result.returncode == 0
    assert f"zones={','.join(want)}" in result.output


def test_neovim_dashboard_mcp_probes_report_transport_results(nv):
    result = nv.nvim_headless(
        "lua local m=require('chapters.mcp-servers') for _,r in ipairs(m.server_records()) do print(r.name..'|'..(r.transport or '?')..'|'..m.probe(r)) end")
    assert result.returncode == 0
    rows = [ln for ln in result.output.splitlines() if "|stdio|" in ln or "|http|" in ln]
    assert any("|stdio|" in ln for ln in rows) and any("|http|" in ln for ln in rows)
    assert rows and all(ln.split("|", 2)[2].strip() for ln in rows)


def test_neovim_dashboard_settings_recovery_pattern_finds_both_backup_kinds(nv):
    tag = f"p8-{os.getpid()}"
    legacy, live = Path(f"/tmp/opencode/nvim-backup-{tag}"), Path(f"/tmp/nvim-live-backup-{tag}")
    for d in (legacy, live):
        d.mkdir(parents=True, exist_ok=True)
    try:
        result = nv.nvim_headless(
            "lua for _,p in ipairs(require('chapters.settings-help').backups()) do print('bk='..p) end")
        assert result.returncode == 0
        assert f"bk={legacy}" in result.output and f"bk={live}" in result.output
    finally:
        for d in (legacy, live):
            d.rmdir()


# ── Live Integration & Runtime Behavior ──────────────────────────────


def test_neovim_live_startup_loads_without_errors(nv):
    """Full init.lua loads plugins and starts up cleanly without Lua exceptions."""
    result = nv.nvim_live("lua print('LIVE_STARTUP_OK')")
    assert result.returncode == 0
    assert "LIVE_STARTUP_OK" in result.output
    assert "Error detected" not in result.output


def test_neovim_live_dashboard_action_resolves_gitroot_from_cwd_without_spurious_warnings(nv, repo_root):
    """Actions triggered from dashboard/unnamed buffer resolve the CWD repo root cleanly."""
    out_file = nv.tmp / "dashboard_action_cwd.txt"
    lua_code = (
        f"lua local a = require('core.actions'); "
        f"local act = a.new({{ name = 'pr-view', effect = function(c) "
        f"local f = io.open('{out_file}', 'w'); f:write('CWD=' .. c); f:close() end }}); "
        f"local c = a.resolve_cwd(act); "
        f"if c then act.effect(c) end"
    )
    result = nv.nvim_live(lua_code, cwd=str(repo_root))
    assert result.returncode == 0
    assert out_file.exists()
    assert f"CWD={repo_root}" == out_file.read_text().strip()
    assert "gitroot: no project" not in result.output


def test_neovim_live_checkhealth_verifies_plugin_setup(nv):
    """Verify that core plugins like snacks and opencode are properly hooked up in checkhealth."""
    out_file = nv.tmp / "checkhealth_output.txt"
    lua_code = f"lua vim.cmd('checkhealth opencode snacks'); vim.cmd('w! {out_file}')"
    result = nv.nvim_live(lua_code)
    assert result.returncode == 0
    content = out_file.read_text() if out_file.exists() else ""
    assert "setup called" in content
    assert "snacks.input enabled" in content
    assert "snacks.picker enabled" in content


def test_neovim_live_gitsigns_attaches_to_tracked_repo_file(nv, repo_root):
    """Verify gitsigns attaches to open buffer in a git repo and exports git status."""
    tracked_file = repo_root / "README.md"
    out_file = nv.tmp / "gitsigns_status.txt"
    lua_code = (
        f"lua vim.wait(1000, function() return vim.b.gitsigns_status_dict ~= nil end); "
        f"local root = vim.b.gitsigns_status_dict and vim.b.gitsigns_status_dict.root or 'NONE'; "
        f"local f = io.open('{out_file}', 'w'); f:write(root); f:close()"
    )
    result = nv.nvim_live(f"edit {tracked_file}", lua_code, cwd=str(repo_root))
    assert result.returncode == 0
    assert out_file.exists()
    assert out_file.read_text().strip() == str(repo_root)
