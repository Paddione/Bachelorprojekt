"""Native migration of tests/spec/merge-arbitration/synthesize-syntax-gate.bats."""

import json
import os
import subprocess

import pytest

GH_AXI_CREATE = """#!/usr/bin/env bash
case "$1 $2" in
  "pr list") echo '[]' ;;
  "pr create") echo "https://example.invalid/pr/1"; exit 0 ;;
  "pr comment") exit 0 ;;
  *) exit 0 ;;
esac
"""

SYNTH_BROKEN = """const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    merged: { "scripts/lib/util.js": "function broken( {\\n  return 1\\n" },
    confidence: 0.95,
    rationale: 'kaputte Syntax zu Testzwecken',
    per_pr_notes: {},
  }));
});
"""

SYNTH_VALID = """const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    merged: { "scripts/lib/util.js": "function ok() {\\n  return 1;\\n}\\n" },
    confidence: 0.95,
    rationale: 'valide Syntax',
    per_pr_notes: {},
  }));
});
"""

KEY = "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"


def _sh(args, cwd, env=None, stdin=None):
    full = dict(os.environ)
    full.update(env or {})
    proc = subprocess.run(
        args, cwd=str(cwd), env=full, input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout


def _git(work, *args):
    proc = subprocess.run(["git", *args], cwd=str(work), capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr


@pytest.fixture
def work(tmp_path):
    repo = tmp_path / "work"
    repo.mkdir()
    _git(repo, "init", "--initial-branch", "main")
    _git(repo, "config", "user.email", "test@test")
    _git(repo, "config", "user.name", "test")
    (repo / "scripts" / "lib").mkdir(parents=True)
    (repo / "scripts" / "lib" / "util.js").write_text("base\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    for n in ("1", "2", "3"):
        if n != "1":
            _git(repo, "checkout", "main")
        _git(repo, "checkout", "-b", f"pr{n}")
        (repo / "scripts" / "lib" / "util.js").write_text(f"change{n}\n", encoding="utf-8")
        _git(repo, "commit", "-am", f"pr{n} change")
    _git(repo, "checkout", "main")
    return repo


def test_t002423_m6_kaputtes_js_in_llm_antwort_fuehrt_zu_eskalation_valides_js_oeffnet_pr(
    tmp_path, repo_root, work
):
    apply_sh = repo_root / "scripts" / "arbitration" / "apply.sh"
    stub = tmp_path / "stub"
    stub.mkdir()
    (stub / "gh-axi").write_text(GH_AXI_CREATE, encoding="utf-8")
    (stub / "gh-axi").chmod(0o755)
    cluster = {
        "cluster_key": KEY,
        "files": ["scripts/lib/util.js"],
        "eligible_prs": [
            {"number": 7001, "head_sha": "sha1", "branch": "pr1", "ticket": "T0001", "title": "fix: pr1"},
            {"number": 7002, "head_sha": "sha2", "branch": "pr2", "ticket": "T0002", "title": "fix: pr2"},
            {"number": 7003, "head_sha": "sha3", "branch": "pr3", "ticket": "T0003", "title": "fix: pr3"},
        ],
        "ineligible_prs": [],
    }
    base_env = {"PATH": f"{stub}{os.pathsep}{os.environ['PATH']}", "GH_AXI": "gh-axi", "TICKET_SH": "/bin/true",
                "SHARED_STATE": "/dev/null"}

    broken = tmp_path / "synthesize-broken.mjs"
    broken.write_text(SYNTH_BROKEN, encoding="utf-8")
    status, output = _sh(
        ["bash", str(apply_sh)], work, {**base_env, "SYNTHESIZE": str(broken)}, json.dumps(cluster)
    )
    assert status == 0, output
    assert "ESCALATE" in output
    assert "syntax_gate" in output
    assert "APPLIED" not in output
    status, _ = _sh(["git", "rev-parse", "--verify", "chore/merge-arbitration-abcdefabcdef"], work)
    assert status != 0

    valid = tmp_path / "synthesize-valid.mjs"
    valid.write_text(SYNTH_VALID, encoding="utf-8")
    status, output = _sh(
        ["bash", str(apply_sh)], work, {**base_env, "SYNTHESIZE": str(valid)}, json.dumps(cluster)
    )
    assert status == 0, output
    assert "APPLIED" in output
    assert "ESCALATE" not in output
    _git(work, "checkout", "main", "-q")
    status, _ = _sh(["git", "rev-parse", "--verify", "chore/merge-arbitration-abcdefabcdef"], work)
    assert status == 0
