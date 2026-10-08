"""Native migration of tests/spec/cbm-health-goals.bats."""

import json
import os
import re
import stat
from pathlib import Path

import pytest

PROJECT = "home-patrick-Bachelorprojekt"

RECEIPT_FROM_REPO = (
    "import importlib.util, sys\n"
    "spec = importlib.util.spec_from_file_location('cbm_freshness', sys.argv[1])\n"
    "mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)\n"
    "root, project = sys.argv[2], 'home-patrick-Bachelorprojekt'\n"
    "head = mod.git_head(root)\n"
    "diff, _ = mod.git_diff_binary(root)\n"
    "untracked, _ = mod.git_untracked_files(root)\n"
    "receipt = {'schema_version': 1, 'timestamp': mod.utc_now_iso(), 'head_sha': head,\n"
    "           'canonical_root': root, 'project': project, 'mode': 'full',\n"
    "           'tool_version': 'stub', 'state_fingerprint':\n"
    "               mod.fingerprint_state(root, head, diff, untracked), 'dirty': False}\n"
    "mod.atomic_write_json(mod.receipt_path(project, root), receipt)\n"
)


def _exec(run_cmd, repo_root, code, *args, env=None):
    """Run an inline python snippet that loads cbm-freshness.py as module `mod`."""
    freshness = str(repo_root / "scripts/mcp/cbm-freshness.py")
    return run_cmd(["python3", "-c", code, freshness, *args], env=env)


def _make_repo(run_cmd, d: Path):
    d.mkdir(parents=True, exist_ok=True)
    run_cmd(["git", "init", "-q", str(d)]).check()
    for k, v in (("user.email", "test@example.com"), ("user.name", "Test"),
                 ("commit.gpgsign", "false")):
        run_cmd(["git", "-C", str(d), "config", k, v]).check()
    (d / "file.txt").write_text("hello\n")
    run_cmd(["git", "-C", str(d), "add", "."]).check()
    run_cmd(["git", "-C", str(d), "commit", "-qm", "init"]).check()


def _write_exec(path: Path, body: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _path_env(bindir: Path):
    return {"PATH": f"{bindir}{os.pathsep}{os.environ.get('PATH', '')}"}


def _stub_freshness(tmp_path: Path, status: str) -> dict:
    stub = tmp_path / "stub-cbm-freshness.py"
    _write_exec(stub, "#!/usr/bin/env python3\n"
                "import json, sys\n"
                f'print(json.dumps({{"status": "{status}", "reasons": ["stub"],\n'
                '                  "refresh_allowed": False, "receipt": None}))\n')
    return {"CBM_FRESHNESS_BIN": str(stub)}


def _stub_cli_index(tmp_path: Path, nodes: int, edges: int, status: str) -> dict:
    bindir = tmp_path / "bin"
    _write_exec(bindir / "codebase-memory-mcp",
                "#!/bin/sh\n"
                'if [ "$1" = "--version" ]; then echo "stub-cbm 0.0.0-test"; exit 0; fi\n'
                'if [ "$1" = "cli" ]; then\n'
                f'  echo "{{\\"project\\":\\"{PROJECT}\\",\\"nodes\\":{nodes},'
                f'\\"edges\\":{edges},\\"status\\":\\"{status}\\",'
                '\\"root_path\\":\\"/tmp\\",\\"git\\":{\\"canonical_root\\":\\"/tmp\\"}}"\n'
                "  exit 0\n"
                "fi\n"
                "exit 1\n")
    return _path_env(bindir)


def _stub_cli_text_detect(tmp_path: Path, root: str) -> dict:
    bindir = tmp_path / "bin-text"
    body = (
        "#!/bin/sh\n"
        'if [ "$1" = "--version" ]; then echo "stub-cbm 0.0.0-test"; exit 0; fi\n'
        'if [ "$1" = "cli" ]; then\n'
        '  if echo "$*" | grep -q index_status; then\n'
        '    inner="{\\"project\\":\\"home-patrick-Bachelorprojekt\\",\\"nodes\\":10,'
        '\\"edges\\":20,\\"status\\":\\"ready\\",\\"root_path\\":\\"@ROOT@\\",'
        '\\"git\\":{\\"canonical_root\\":\\"@ROOT@\\"}}"\n'
        "    jq -nc --arg t \"$inner\" '{content:[{type:\"text\",text:$t}]}'\n"
        "    exit 0\n"
        "  fi\n"
        "  # real tool 0.10.8: detect_changes is human-readable text inside the MCP envelope\n"
        '  txt=$(printf \'%s\\n\' "base: main" "merge_base: abc" "direction: inbound" "changed_files: 0")\n'
        "  jq -nc --arg t \"$txt\" '{content:[{type:\"text\",text:$t}]}'\n"
        "  exit 0\n"
        "fi\n"
        "exit 1\n"
    ).replace("@ROOT@", root)
    _write_exec(bindir / "codebase-memory-mcp", body)
    return _path_env(bindir)


def _stub_cli_main_root(tmp_path: Path, main_root: str) -> dict:
    bindir = tmp_path / "bin-main"
    body = (
        "#!/bin/sh\n"
        'if [ "$1" = "--version" ]; then echo "stub-cbm 0.0.0-test"; exit 0; fi\n'
        'if [ "$1" = "cli" ]; then\n'
        '  if echo "$*" | grep -q index_status; then\n'
        '    inner="{\\"project\\":\\"home-patrick-Bachelorprojekt\\",\\"nodes\\":10,'
        '\\"edges\\":20,\\"status\\":\\"ready\\",\\"root_path\\":\\"@ROOT@\\",'
        '\\"git\\":{\\"canonical_root\\":\\"@ROOT@\\"}}"\n'
        "    jq -nc --arg t \"$inner\" '{content:[{type:\"text\",text:$t}]}'\n"
        "    exit 0\n"
        "  fi\n"
        "  txt=$(printf '%s\\n' \"base: main\" \"changed_files: 0\")\n"
        "  jq -nc --arg t \"$txt\" '{content:[{type:\"text\",text:$t}]}'\n"
        "  exit 0\n"
        "fi\n"
        "exit 1\n"
    ).replace("@ROOT@", main_root)
    _write_exec(bindir / "codebase-memory-mcp", body)
    return _path_env(bindir)


def _run_row(run_cmd, repo_root, tmp_path, goal, env):
    """Run the health check filtered to one row; values land in values.txt."""
    values = tmp_path / "values.txt"
    if values.exists():
        values.unlink()
    check = repo_root / "scripts/health-goals-check.sh"
    run_cmd(["bash", str(check), f"--only={goal}", "--quiet"],
            env={**env, "HG_VALUES_FILE": str(values)})
    return values


def _has_line(path: Path, pattern: str) -> bool:
    """grep -q 'pattern' file: False when the file is missing."""
    return path.exists() and re.search(pattern, path.read_text(), re.M) is not None


def test_g_k3fresh_row_exists_in_the_health_check(repo_root):
    check = repo_root / "scripts/health-goals-check.sh"
    assert "G-K3FRESH" in check.read_text()


def test_g_k3fresh_fresh_receipt_verdict_green_1_eq_1(run_cmd, repo_root, tmp_path):
    env = _stub_freshness(tmp_path, "fresh")
    values = _run_row(run_cmd, repo_root, tmp_path, "G-K3FRESH", env)
    assert _has_line(values, r"^G-K3FRESH 1 eq 1$")


def test_g_k3fresh_unknown_verdict_not_green_fail_closed_never_fake_pass(
        run_cmd, repo_root, tmp_path):
    env = _stub_freshness(tmp_path, "unknown")
    values = _run_row(run_cmd, repo_root, tmp_path, "G-K3FRESH", env)
    assert _has_line(values, r"^G-K3FRESH 0 eq 1$")


def test_g_k3fresh_broken_helper_output_skip_na_not_a_fake_pass(
        run_cmd, repo_root, tmp_path):
    _stub_freshness(tmp_path, "fresh")
    broken = tmp_path / "broken.py"
    _write_exec(broken, "#!/bin/sh\necho not-json\n")
    env = {"CBM_FRESHNESS_BIN": str(broken)}
    values = _run_row(run_cmd, repo_root, tmp_path, "G-K3FRESH", env)
    assert not _has_line(values, r"^G-K3FRESH")


def test_g_k3proj_row_exists_in_the_health_check(repo_root):
    check = repo_root / "scripts/health-goals-check.sh"
    assert "G-K3PROJ" in check.read_text()


def test_g_k3proj_indexed_project_with_nodes_edges_green(run_cmd, repo_root, tmp_path):
    env = _stub_cli_index(tmp_path, 1000, 2000, "ready")
    values = _run_row(run_cmd, repo_root, tmp_path, "G-K3PROJ", env)
    assert _has_line(values, r"^G-K3PROJ 1 eq 1$")


def test_g_k3proj_probe_failure_not_green_fail_closed(run_cmd, repo_root, tmp_path):
    bindir = tmp_path / "bin-broken"
    _write_exec(bindir / "codebase-memory-mcp", "#!/bin/sh\nexit 1\n")
    values = _run_row(run_cmd, repo_root, tmp_path, "G-K3PROJ", _path_env(bindir))
    assert _has_line(values, r"^G-K3PROJ 0 eq 1$")


def test_cbm_freshness_text_only_detect_changes_output_is_non_fatal_t002430(
        run_cmd, repo_root, tmp_path):
    # tool 0.10.8 has no JSON mode for detect_changes; it must not force unknown
    root = tmp_path / "repo"
    _make_repo(run_cmd, root)
    env = _stub_cli_text_detect(tmp_path, _real_toplevel(run_cmd, root))
    _exec(run_cmd, repo_root, RECEIPT_FROM_REPO, str(root), env=env).check()
    result = run_cmd(["python3", str(repo_root / "scripts/mcp/cbm-freshness.py"),
                      "status", "--repo", str(root), "--project", PROJECT], env=env)
    assert result.returncode == 0
    assert json.loads(result.output)["status"] == "fresh"


def test_cbm_freshness_worktree_checkout_accepted_against_main_root_index_t002430(
        run_cmd, repo_root, tmp_path):
    main = tmp_path / "main"
    wt = tmp_path / "wt"
    _make_repo(run_cmd, main)
    run_cmd(["git", "-C", str(main), "worktree", "add", "-q", str(wt)])
    env = _stub_cli_main_root(tmp_path, str(main))
    # wrapper writes the receipt keyed by the worktree root, but the tool
    # canonicalizes the root to the main checkout -- that is the T002430 defect
    code = (
        "import importlib.util, sys\n"
        "spec = importlib.util.spec_from_file_location('cbm_freshness', sys.argv[1])\n"
        "mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)\n"
        "main, wt, project = sys.argv[2], sys.argv[3], 'home-patrick-Bachelorprojekt'\n"
        "head = mod.git_head(wt)\n"
        "diff, _ = mod.git_diff_binary(wt)\n"
        "untracked, _ = mod.git_untracked_files(wt)\n"
        "receipt = {'schema_version': 1, 'timestamp': mod.utc_now_iso(), 'head_sha': head,\n"
        "           'canonical_root': main, 'project': project, 'mode': 'full',\n"
        "           'tool_version': 'stub', 'state_fingerprint':\n"
        "               mod.fingerprint_state(wt, head, diff, untracked), 'dirty': False}\n"
        "mod.atomic_write_json(mod.receipt_path(project, wt), receipt)\n"
    )
    _exec(run_cmd, repo_root, code, str(main), str(wt), env=env).check()
    result = run_cmd(["python3", str(repo_root / "scripts/mcp/cbm-freshness.py"),
                      "status", "--repo", str(wt), "--project", PROJECT], env=env)
    assert result.returncode == 0
    payload = json.loads(result.output)
    assert payload["status"] == "fresh"
    assert "root-mismatch" not in payload["reasons"]


def _real_toplevel(run_cmd, root: Path) -> str:
    return os.path.realpath(
        run_cmd(["git", "-C", str(root), "rev-parse", "--show-toplevel"]).stdout.strip())
