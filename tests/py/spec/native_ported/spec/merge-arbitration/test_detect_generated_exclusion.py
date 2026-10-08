"""Native migration of tests/spec/merge-arbitration/detect-generated-exclusion.bats."""

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


def _count(output):
    filtered = "\n".join(line for line in output.splitlines() if not line.startswith("DEBUG"))
    return len(json.loads(filtered))


def test_t002423_m3_generated_files_erzeugen_keinen_cluster_positiv_anker_nicht_generated_feuert(
    tmp_path, repo_root
):
    detect = repo_root / "scripts" / "arbitration" / "detect.sh"
    work = tmp_path / "work"
    work.mkdir()
    _git(work, "init", "--initial-branch", "main")
    _git(work, "config", "user.email", "test@test")
    _git(work, "config", "user.name", "test")
    (work / "docs" / "code-quality").mkdir(parents=True)
    (work / "docs" / "code-quality" / "repo-index.json").write_text('{"generated":true}\n', encoding="utf-8")
    (work / ".gitattributes").write_text(
        "docs/code-quality/repo-index.json merge=ours linguist-generated=true\n", encoding="utf-8"
    )
    _git(work, "add", "-A")
    _git(work, "commit", "-m", "base with gitattributes")
    for n in ("1", "2", "3"):
        if n != "1":
            _git(work, "checkout", "main")
        _git(work, "checkout", "-b", f"pr{n}")
        (work / "docs" / "code-quality" / "repo-index.json").write_text(f"change{n}\n", encoding="utf-8")
        _git(work, "commit", "-am", f"pr{n} change")
    _git(work, "checkout", "main")

    stub = tmp_path / "stub"
    stub.mkdir()
    env = {"PATH": f"{stub}{os.pathsep}{os.environ['PATH']}", "GH_AXI": "gh-axi"}

    _write_gh(stub, [_pr(3001, "pr1", "fix: pr1 [T0001]"), _pr(3002, "pr2", "fix: pr2 [T0002]"),
                     _pr(3003, "pr3", "fix: pr3 [T0003]")])
    status, output = _sh(["bash", str(detect)], work, env)
    assert _count(output) == 0

    (work / "scripts").mkdir()
    (work / "scripts" / "agent-lock.sh").write_text("change\n", encoding="utf-8")
    _git(work, "add", "scripts/agent-lock.sh")
    _git(work, "commit", "-m", "add agent-lock.sh")
    for n in ("4", "5", "6"):
        _git(work, "checkout", "-b", f"pr{n}")
        (work / "scripts" / "agent-lock.sh").write_text(f"change{n}\n", encoding="utf-8")
        _git(work, "commit", "-am", f"pr{n} change")
        _git(work, "checkout", "main")

    _write_gh(stub, [_pr(4001, "pr4", "fix: pr4 [T0004]"), _pr(4002, "pr5", "fix: pr5 [T0005]"),
                     _pr(4003, "pr6", "fix: pr6 [T0006]")])
    status, output = _sh(["bash", str(detect)], work, env)
    assert _count(output) == 1
