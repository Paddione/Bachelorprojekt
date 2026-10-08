"""Native migration of tests/spec/ci-cd/spec-tracked-file-guard.bats."""

import os
import re
import subprocess
import time
from pathlib import Path

import pytest


def _sandbox(tmp_path: Path) -> Path:
    """_sandbox: Wegwerf-Repo mit getracktem tracked.txt."""
    d = tmp_path / "sandbox"
    d.mkdir()
    env = dict(os.environ)
    subprocess.run(["git", "-C", str(d), "init", "-q"], check=True, env=env)
    (d / "tracked.txt").write_text("original\n")
    subprocess.run(["git", "-C", str(d), "add", "tracked.txt"], check=True, env=env)
    subprocess.run(["git", "-C", str(d), "-c", "user.email=t@t", "-c", "user.name=t",
                    "commit", "-qm", "init"], check=True, env=env)
    return d


def test_t002779_mcp_tooling_bats_laesst_die_getrackte_mcp_registry_unberuehrt():
    # Der Test fuehrt mcp-tooling.bats in einer Sandbox per bats-Binary aus.
    # Der bats-Aufruf ist im Python-Port nicht zulaessig (Regel 5).
    pytest.skip("nicht portierbar: erfordert den bats-Runner in einer Sandbox (Regel 5)")


def test_t002779_das_guard_skript_existiert_und_ist_ausfuehrbar(run_cmd, repo_root):
    guard = repo_root / "scripts/spec-tracked-file-guard.sh"
    assert guard.is_file()
    res = run_cmd(["bash", str(guard), "--help"], cwd=repo_root)
    assert res.returncode == 0


def test_t002779_der_guard_meldet_eine_beruehrte_getrackte_datei_mit_pfad(run_cmd, repo_root, tmp_path):
    guard = repo_root / "scripts/spec-tracked-file-guard.sh"
    d = _sandbox(tmp_path)
    snap = tmp_path / "snap"

    res = run_cmd(["bash", "-c", f"cd '{d}' && bash '{guard}' snapshot '{snap}'"], cwd=repo_root)
    assert res.returncode == 0

    # Mutieren und restaurieren: Inhalt identisch, mtime verraet den Zugriff.
    time.sleep(1)
    (d / "tracked.txt").write_text("mutiert\n")
    (d / "tracked.txt").write_text("original\n")

    status = subprocess.run(["git", "-C", str(d), "status", "--porcelain"],
                            capture_output=True, text=True).stdout
    assert status == "" or status.strip() == ""  # Belegt: ein git-status-Check waere hier blind.

    res = run_cmd(["bash", "-c", f"cd '{d}' && bash '{guard}' verify '{snap}'"], cwd=repo_root)
    assert res.returncode != 0
    assert "tracked.txt" in res.output


def test_t002779_der_guard_bleibt_gruen_wenn_nichts_angefasst_wurde(run_cmd, repo_root, tmp_path):
    guard = repo_root / "scripts/spec-tracked-file-guard.sh"
    d = _sandbox(tmp_path)
    snap = tmp_path / "snap-clean"

    res = run_cmd(["bash", "-c", f"cd '{d}' && bash '{guard}' snapshot '{snap}'"], cwd=repo_root)
    assert res.returncode == 0

    res = run_cmd(["bash", "-c", f"cd '{d}' && bash '{guard}' verify '{snap}'"], cwd=repo_root)
    assert res.returncode == 0


def test_t002779_untracked_dateien_sind_kein_verstoss(run_cmd, repo_root, tmp_path):
    guard = repo_root / "scripts/spec-tracked-file-guard.sh"
    d = _sandbox(tmp_path)
    snap = tmp_path / "snap-untracked"

    res = run_cmd(["bash", "-c", f"cd '{d}' && bash '{guard}' snapshot '{snap}'"], cwd=repo_root)
    assert res.returncode == 0

    time.sleep(1)
    (d / "scratch.tmp").write_text("scratch\n")

    res = run_cmd(["bash", "-c", f"cd '{d}' && bash '{guard}' verify '{snap}'"], cwd=repo_root)
    assert res.returncode == 0


def test_t002779_task_test_spec_ruft_den_guard_auf(repo_root):
    text = (repo_root / "taskfiles/Taskfile.test.yml").read_text()
    count = sum(1 for ln in text.splitlines() if "spec-tracked-file-guard" in ln)
    # Beide Tasks - test:spec UND test:spec:changed - muessen den Guard fuehren.
    assert count >= 2
