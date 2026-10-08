"""Native migration of tests/spec/merge-arbitration/detect-threshold.bats."""

import json
import os
import subprocess

import pytest


def _sh(args, cwd, env=None):
    full = dict(os.environ)
    full.update(env or {})
    proc = subprocess.run(
        args, cwd=str(cwd), env=full,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout


def _git(work, *args):
    proc = subprocess.run(["git", *args], cwd=str(work), capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr


def _pr(number, branch, title):
    return {
        "number": number,
        "headRefName": branch,
        "headRefOid": "HEAD",
        "isDraft": False,
        "labels": [],
        "statusCheckRollup": [{"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "SUCCESS"}],
        "title": title,
    }


def _write_gh(stub, prs):
    path = stub / "gh-axi"
    path.write_text(f"#!/usr/bin/env bash\necho '{json.dumps(prs)}'\n", encoding="utf-8")
    path.chmod(0o755)


@pytest.fixture
def work(tmp_path):
    repo = tmp_path / "work"
    repo.mkdir()
    _git(repo, "init", "--initial-branch", "main")
    _git(repo, "config", "user.email", "test@test")
    _git(repo, "config", "user.name", "test")
    (repo / "file-a.ts").write_text("base\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    for n in ("1", "2", "3"):
        if n != "1":
            _git(repo, "checkout", "main")
        _git(repo, "checkout", "-b", f"pr{n}")
        (repo / "file-a.ts").write_text(f"change{n}\n", encoding="utf-8")
        _git(repo, "commit", "-am", f"pr{n} change")
    _git(repo, "checkout", "main")
    return repo


def test_t002423_m2_2_stimmberechtigte_prs_kein_cluster_positiv_anker_3_prs_feuert(
    tmp_path, repo_root, work
):
    detect = repo_root / "scripts" / "arbitration" / "detect.sh"
    stub = tmp_path / "stub"
    stub.mkdir()
    env = {"PATH": f"{stub}{os.pathsep}{os.environ['PATH']}", "GH_AXI": "gh-axi", "GIT_ATTR": "/dev/null"}

    two = [_pr(2001, "pr1", "fix: pr1 [T0001]"), _pr(2002, "pr2", "fix: pr2 [T0002]")]
    _write_gh(stub, two)
    status, output = _sh(["bash", str(detect)], work, env)
    assert status == 0, output
    filtered = "\n".join(
        line for line in output.splitlines()
        if not line.startswith("DEBUG") and not line.startswith("BW01")
    )
    assert len(json.loads(filtered)) == 0

    three = two + [_pr(2003, "pr3", "fix: pr3 [T0003]")]
    _write_gh(stub, three)
    status, output = _sh(["bash", str(detect)], work, env)
    filtered = "\n".join(
        line for line in output.splitlines()
        if not line.startswith("DEBUG") and not line.startswith("BW01")
    )
    assert len(json.loads(filtered)) == 1
