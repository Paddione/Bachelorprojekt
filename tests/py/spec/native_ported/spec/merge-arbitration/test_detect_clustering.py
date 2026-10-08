"""Native migration of tests/spec/merge-arbitration/detect-clustering.bats."""

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


def _pr(number, branch, title, draft=False, labels=()):
    return {
        "number": number,
        "headRefName": branch,
        "headRefOid": "HEAD",
        "isDraft": draft,
        "labels": [{"name": name} for name in labels],
        "statusCheckRollup": [{"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "SUCCESS"}],
        "title": title,
    }


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
    for n in ("1", "2", "3", "4", "5"):
        if n != "1":
            _git(repo, "checkout", "main")
        _git(repo, "checkout", "-b", f"pr{n}")
        (repo / "file-a.ts").write_text(f"change{n}\n", encoding="utf-8")
        _git(repo, "commit", "-am", f"pr{n} change")
    _git(repo, "checkout", "main")
    return repo


def test_t002423_m1_detect_sh_findet_3er_cluster_und_ignoriert_draft_arbitration(
    tmp_path, repo_root, work
):
    detect = repo_root / "scripts" / "arbitration" / "detect.sh"
    stub = tmp_path / "stub"
    stub.mkdir()
    prs = [
        _pr(1001, "pr1", "fix: pr1 [T0001]"),
        _pr(1002, "pr2", "fix: pr2 [T0002]"),
        _pr(1003, "pr3", "fix: pr3 [T0003]"),
        _pr(1004, "pr4", "fix: pr4 [T0004]", draft=True),
        _pr(1005, "pr5", "fix: pr5 [T0005]", labels=("arbitration",)),
    ]
    (stub / "gh-axi").write_text(f"#!/usr/bin/env bash\necho '{json.dumps(prs)}'\n", encoding="utf-8")
    (stub / "gh-axi").chmod(0o755)
    env = {"PATH": f"{stub}{os.pathsep}{os.environ['PATH']}", "GH_AXI": "gh-axi", "GIT_ATTR": "/dev/null"}

    status, output = _sh(["bash", str(detect)], work, env)
    assert status == 0, output
    lines = [line for line in output.splitlines() if not line.startswith("DEBUG")]
    clusters = json.loads("\n".join([l for l in lines if not l.startswith("BW01")]))
    assert len(clusters) == 1

    cluster_key = json.loads(output)[0]["cluster_key"]
    assert cluster_key and len(cluster_key) == 64
    assert len(json.loads(output)[0]["eligible_prs"]) == 3
    assert len(json.loads(output)[0]["ineligible_prs"]) == 2
