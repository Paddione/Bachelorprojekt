"""Native migration of tests/spec/local-llm-proxy/tools-runtime-sandbox.bats."""

# [T012971]

import json
import os
import shutil
import subprocess
import uuid

import pytest

CONTAINER = "llama-tools-sandbox-bats"


def _docker_up():
    if shutil.which("docker") is None:
        return False
    return subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def _sandbox_env(workspace):
    return {"TOOLS_SANDBOX_NAME": CONTAINER, "TOOLS_SANDBOX_WORKSPACE": str(workspace)}


def _down(run_cmd, repo_root, sandbox):
    run_cmd(["bash", str(sandbox), "down"], cwd=repo_root, env={"TOOLS_SANDBOX_NAME": CONTAINER})


def test_tools_runtime_sandbox_jedes_loadout_mit_tools_nennt_auch_eine_toolsruntime(run_cmd, repo_root):
    loadouts = repo_root / "scripts/llm/loadouts.json"
    js = (
        f"const doc = require('{loadouts}');\n"
        "const bare = doc.loadouts.filter(l => l.tools && !l.toolsRuntime).map(l => l.slug);\n"
        "const withRuntime = doc.loadouts.filter(l => l.tools && l.toolsRuntime).map(l => l.slug);\n"
        "console.log('BARE=' + bare.join(','));\n"
        "console.log('GUARDED=' + withRuntime.join(','));\n"
    )
    res = run_cmd(["node", "-e", js], cwd=repo_root)
    assert res.returncode == 0, res.output
    out = res.output
    # Positiv-Anker: mindestens ein Loadout fuehrt Tools MIT Laufzeit.
    guarded_line = next((l for l in out.splitlines() if l.startswith("GUARDED=")), "GUARDED=")
    assert len(guarded_line) > len("GUARDED=")
    bare_line = next((l for l in out.splitlines() if l.startswith("BARE=")), "BARE=")
    assert bare_line.split("=", 1)[1] == "", f"Loadouts mit tools ohne toolsRuntime: {bare_line}"


def test_tools_runtime_sandbox_der_preflight_erkennt_einen_fehlenden_container(run_cmd, repo_root):
    js = (
        "const { toolsRuntimeMissing } = await import('" + str(repo_root) + "/scripts/llm-proxy/runner.mjs')\n"
        "console.log(toolsRuntimeMissing({ toolsRuntime: 'docker-container:gibt-es-sicher-nicht-xyz' }) ?? 'NULL')\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "gibt-es-sicher-nicht-xyz" in res.output
    assert "tools-sandbox.sh up" in res.output


def test_tools_runtime_sandbox_der_gestartete_container_hat_kein_netz_und_sieht_das_repo_nur_lesend(run_cmd, repo_root, tmp_path):
    if not _docker_up():
        pytest.skip("kein erreichbarer Docker-Daemon")
    sandbox = repo_root / "scripts/llm/tools-sandbox.sh"
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "datei.txt").write_text("inhalt\n", encoding="utf-8")
    try:
        up = run_cmd(["bash", str(sandbox), "up"], cwd=repo_root, env=_sandbox_env(ws))
        assert up.returncode == 0, up.output

        res = run_cmd(["docker", "exec", CONTAINER, "cat", "/workspace/datei.txt"], cwd=repo_root)
        assert res.returncode == 0 and "inhalt" in res.output
        res = run_cmd(["docker", "exec", CONTAINER, "sh", "-c", "echo lebt"], cwd=repo_root)
        assert res.returncode == 0 and "lebt" in res.output

        res = run_cmd(["docker", "exec", CONTAINER, "sh", "-c", "wget -q -T2 -O- https://example.com"], cwd=repo_root)
        assert res.returncode != 0

        res = run_cmd(["docker", "exec", CONTAINER, "sh", "-c", "touch /workspace/BATS_PWNED"], cwd=repo_root)
        assert res.returncode != 0
        assert not (ws / "BATS_PWNED").exists()

        res = run_cmd(["docker", "exec", CONTAINER, "sh", "-c", "ls /home/patrick/.ssh"], cwd=repo_root)
        assert res.returncode != 0
    finally:
        _down(run_cmd, repo_root, sandbox)


def test_tools_runtime_sandbox_ein_git_worktree_als_workspace_wird_abgelehnt_statt_still_halb_zu_funktionieren(run_cmd, repo_root, tmp_path):
    if not _docker_up():
        pytest.skip("kein erreichbarer Docker-Daemon")
    sandbox = repo_root / "scripts/llm/tools-sandbox.sh"
    wt = tmp_path / "wt"
    add = run_cmd(["git", "-C", str(repo_root), "worktree", "add", "--detach", str(wt), "HEAD"], cwd=repo_root)
    if add.returncode != 0:
        pytest.skip("worktree add nicht moeglich")
    try:
        assert (wt / ".git").is_file()
        res = run_cmd(["bash", str(sandbox), "up"], cwd=repo_root, env=_sandbox_env(wt))
        rc, out = res.returncode, res.output
    finally:
        run_cmd(["git", "-C", str(repo_root), "worktree", "remove", "--force", str(wt)], cwd=repo_root)
    assert rc != 0
    assert "Worktree" in out
    assert "file_glob_search" in out


def test_tools_runtime_sandbox_git_ls_files_funktioniert_im_container_file_glob_search_braucht_es(run_cmd, repo_root):
    if not _docker_up():
        pytest.skip("kein erreichbarer Docker-Daemon")
    git_dir = run_cmd(["git", "-C", str(repo_root), "rev-parse", "--git-dir"], cwd=repo_root)
    if git_dir.returncode != 0:
        pytest.skip("kein git-Repo")
    if not (repo_root / ".git").is_dir():
        pytest.skip("REPO_ROOT ist ein Worktree — siehe vorigen Test")
    sandbox = repo_root / "scripts/llm/tools-sandbox.sh"
    try:
        # Up-Status bewusst ungeprueft (wie >/dev/null im Original).
        run_cmd(["bash", str(sandbox), "up"], cwd=repo_root, env=_sandbox_env(repo_root))
        res = run_cmd(
            ["docker", "exec", CONTAINER, "sh", "-c",
             'cd "$1" && git ls-files --cached --others --exclude-standard', "_", "/workspace"],
            cwd=repo_root,
        )
        rc, out = res.returncode, res.output
    finally:
        _down(run_cmd, repo_root, sandbox)
    assert rc == 0
    assert out
    assert "dubious ownership" not in out
    assert "not a git repository" not in out
